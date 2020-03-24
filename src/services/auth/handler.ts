import {
  HttpStatus,
  KastleResponseHeaders as headers,
} from '@g-six/kastle-router'
import { Database as database } from '@g-six/swiss-knife'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { pick } from 'lodash'
import { Mandrill } from 'mandrill-api'
import version from './version'

import {
  activate as activateUser,
  create as createRecord,
  login as loginUser,
  resetPassword as resetUserPassword,
  verifyClient,
  forgotPassword,
} from './model'
import {
  Response,
  EmailRecipient,
  EmailTemplates,
  EmailTemplateParams,
} from './types'

const errorResponse = (code: number, error: string, errors?: {}): Response => ({
  body: JSON.stringify(
    {
      error,
      errors,
    },
    null,
    2,
  ),
  headers,
  statusCode: code || 500,
})

const sendMail = async (
  recipient: EmailRecipient,
  template: EmailTemplates,
  params: EmailTemplateParams[],
) => {
  const { MANDRILL_API_KEY } = process.env
  const mandrill_client = new Mandrill(MANDRILL_API_KEY as string)
  const template_name = template
  const template_content = params

  const message = {
    to: [
      {
        email: recipient.email,
        name: [recipient.first_name, recipient.last_name].join(' '),
        type: 'to',
      },
    ],
    global_merge_vars: template_content,
  }

  await new Promise((resolve, reject) => {
    mandrill_client.messages.sendTemplate(
      {
        template_name,
        template_content,
        async: true,
        message,
      },
      (results) => {
        console.log(results)
        resolve(results)
      },
      (error) => {
        /* istanbul ignore next */
        console.log(error)
        /* istanbul ignore next */
        reject(error)
      },
    )
  })

  return true
}

export const index = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        message: `Life's a peach, eat more apples!`,
        version,
      },
      null,
      2,
    ),
  }
}

export const activate = async (event: APIGatewayProxyEvent) => {
  let response: Response = {
    body: '',
    headers,
    statusCode: 500,
  }

  if (!event.body || event.body === '{}') {
    return errorResponse(400, HttpStatus.E_400)
  }

  const { email, activation_key } = JSON.parse(event.body)
  if (!email || !activation_key) {
    return errorResponse(400, HttpStatus.E_400)
  }

  const db = await database.getDatabase()

  try {
    const results = await activateUser(email, activation_key, db)
    response.statusCode = 200
    response.headers['kasl-key'] = results['kasl-key']

    response.body = JSON.stringify(
      {
        data: pick(results, [
          'id',
          'email',
          'created_at',
          'registered_at',
          'updated_at',
        ]),
      },
      null,
      2,
    )
  } catch (e) {
    response = errorResponse(e.status, e.message)
  }

  await database.disconnectDb()

  return response
}

export const create = async (event: APIGatewayProxyEvent) => {
  let response: Response = {
    body: '',
    headers,
    statusCode: 500,
  }

  if (!event.body || event.body === '{}') {
    return errorResponse(400, HttpStatus.E_400)
  }

  const {
    email,
    first_name,
    last_name,
    password,
    confirm_password,
  } = JSON.parse(event.body)
  const errors = []

  if (!email) {
    errors.push({
      field: 'email',
      message: 'error.email.required',
    })
  }
  if (!first_name) {
    errors.push({
      field: 'first_name',
      message: 'error.first_name.required',
    })
  }
  if (!last_name) {
    errors.push({
      field: 'last_name',
      message: 'error.last_name.required',
    })
  }

  if (!password) {
    errors.push({
      field: 'password',
      message: 'error.password.required',
    })
  }

  if (confirm_password != password) {
    errors.push({
      field: 'confirm_password',
      message: 'error.confirm_password.invalid',
    })
  }

  if (errors.length > 0) {
    return errorResponse(400, HttpStatus.E_400, errors)
  }

  const db = await database.getDatabase()

  if (event.headers['client-id'] && event.headers['client-secret']) {
    if (
      event.headers['client-id'] !== process.env.CLIENT_ID ||
      event.headers['client-secret'] !== process.env.CLIENT_SECRET
    ) {
      if (
        !(await verifyClient(
          event.headers['client-id'],
          event.headers['client-secret'],
          db,
        ))
      ) {
        await database.disconnectDb()
        return errorResponse(401, HttpStatus.E_401)
      }
    }
  }

  try {
    const payload = JSON.parse(event.body)
    const data = await createRecord(payload, db)

    const template_content = [
      {
        name: 'first_name',
        content: data.first_name,
      },
      {
        name: 'activation_link',
        content: `${event.headers.Referer}?k=${data.activation_link}`,
      },
    ]

    await sendMail(data, EmailTemplates.EMAIL_VERIFICATION, template_content)

    response.statusCode = 200

    response.body = JSON.stringify(
      {
        data,
      },
      null,
      2,
    )
  } catch (e) {
    response = errorResponse(e.status, e.stack)
    /* istanbul ignore else */
    if (e.message) {
      response = errorResponse(e.status, e.message)
    }
  }

  await database.disconnectDb()
  return response
}

export const login = async (event: APIGatewayProxyEvent) => {
  let response: Response = {
    body: '',
    headers,
    statusCode: 500,
  }

  if (!event.body || event.body === '{}') {
    return errorResponse(400, HttpStatus.E_400)
  }

  const { email, password } = JSON.parse(event.body)
  const errors = []

  if (!email) {
    errors.push({
      field: 'email',
      message: 'error.email.required',
    })
  }

  if (!password) {
    errors.push({
      field: 'password',
      message: 'error.password.required',
    })
  }

  if (errors.length > 0) {
    return errorResponse(400, HttpStatus.E_400, errors)
  }

  const db = await database.getDatabase()

  try {
    const results = await loginUser(email, password, db)
    response.statusCode = 200
    response.headers['kasl-key'] = results['kasl-key']

    response.body = JSON.stringify(
      {
        data: pick(results, ['id', 'email']),
      },
      null,
      2,
    )
  } catch (e) {
    response = errorResponse(e.status, e.message)
  }

  await database.disconnectDb()

  return response
}

export const resetPassword = async (event: APIGatewayProxyEvent) => {
  let response: Response = {
    body: '',
    headers,
    statusCode: 500,
  }

  if (!event.body || event.body === '{}') {
    return errorResponse(400, HttpStatus.E_400)
  }

  const { email, reset_key, password, confirm_password } = JSON.parse(
    event.body,
  )
  const errors = []

  if (!email) {
    errors.push({
      field: 'email',
      message: 'error.email.required',
    })
  }
  if (!reset_key) {
    errors.push({
      field: 'reset_key',
      message: 'error.reset_key.required',
    })
  }

  if (!password) {
    errors.push({
      field: 'password',
      message: 'error.password.required',
    })
  }

  if (confirm_password != password) {
    errors.push({
      field: 'confirm_password',
      message: 'error.confirm_password.invalid',
    })
  }

  if (errors.length > 0) {
    return errorResponse(400, HttpStatus.E_400, errors)
  }

  const db = await database.getDatabase()

  try {
    const results = await resetUserPassword(
      email,
      reset_key,
      password,
      confirm_password,
      db,
    )
    response.statusCode = 200
    response.headers['kasl-key'] = results['kasl-key']

    response.body = JSON.stringify(
      {
        data: pick(results, [
          'id',
          'email',
          'created_at',
          'registered_at',
          'updated_at',
        ]),
      },
      null,
      2,
    )
  } catch (e) {
    response = errorResponse(e.status, e.message)
  }

  await database.disconnectDb()

  return response
}

export const forgot = async (event: APIGatewayProxyEvent) => {
  let response: Response = {
    body: '',
    headers,
    statusCode: 500,
  }

  if (!event.body || event.body === '{}') {
    return errorResponse(400, HttpStatus.E_400)
  }

  const { email } = JSON.parse(event.body)
  const errors = []

  if (!email) {
    errors.push({
      field: 'email',
      message: 'error.email.required',
    })
  }

  if (errors.length > 0) {
    return errorResponse(400, HttpStatus.E_400, errors)
  }

  const db = await database.getDatabase()

  try {
    const user = await forgotPassword(email, db)

    const template_content = [
      {
        name: 'first_name',
        content: user.first_name,
      },
      {
        name: 'reset_link',
        content: `${event.headers.Referer}?k=${user.reset_key}`,
      },
    ]
    await sendMail(user, EmailTemplates.FORGOT_PASSWORD, template_content)

    response.statusCode = 200

    response.body = JSON.stringify(
      {
        data: pick(user, ['email', 'reset_requested_at']),
      },
      null,
      2,
    )
  } catch (e) {
    response = errorResponse(e.status, e.stack)
    /* istanbul ignore else */
    if (e.message) {
      response = errorResponse(e.status, e.message)
    }
  }

  await database.disconnectDb()

  return response
}
