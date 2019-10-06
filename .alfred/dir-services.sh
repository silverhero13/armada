for dir in $(ls -d src/services/*/)
do
  SERVICE_NAME=$(basename $dir)
  echo $SERVICE_NAME

  cp .env $dir
  cd $dir

  echo "export default '"$COMMIT_SHA"'" > version.ts

  IMAGE_NAME=${GIT_REPO_NAME}'-'$SERVICE_NAME
  PREFIX='[<'$BUILD_URL'console|'$BUILD_NUMBER':'$COMMIT_SHA'>]'

  IMAGE_TAG=$IMAGE_NAME':'$COMMIT_SHA
  curl -X POST -s $SLACK_URL -d '{
    "type": "mrkdwn",
    "text": "'$PREFIX' `docker build -t '$IMAGE_TAG' .`"
  }'
  docker build -t $IMAGE_TAG .

  curl -X POST -s $SLACK_URL -d '{
    "type": "mrkdwn",
    "text": "'$PREFIX' ```docker run --env-file .env \n  --name '$IMAGE_NAME' \n  '$IMAGE_TAG' .```"
  }'
  docker run --rm --env-file .env --name $IMAGE_NAME $IMAGE_TAG

  curl -X POST -s $SLACK_URL -d '{
    "type": "mrkdwn",
    "text": "'$PREFIX' `docker rmi '$IMAGE_TAG'`"
  }'

  docker rmi $IMAGE_TAG
  cd $ROOT_DIR
done