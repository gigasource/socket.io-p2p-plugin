module.exports.modifyTopicName = function(service, topicName) { // this is to avoid topic name clashing
  return `service:${service}:topic:${topicName}`;
}
