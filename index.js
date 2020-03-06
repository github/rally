/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Application} app
 */
module.exports = app => {
  // Your code here
  app.log('Yay, the app was loaded!')

  app.on('issues.opened', async context => {
    const issueComment = context.issue({ body: 'Thanks for opening this issue!' })
    return context.github.issues.createComment(issueComment)
  })

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
}

var rally = require('rally'),
var restApi = rally({
        //user: 'userName', //required if no api key, defaults to process.env.RALLY_USERNAME
        //pass: 'password', //required if no api key, defaults to process.env.RALLY_PASSWORD
        //apiKey: '_12fj83fjk...', //preferred, required if no user/pass, defaults to process.env.RALLY_API_KEY
        apiVersion: 'v2.0', //this is the default and may be omitted
        server: 'https://rally1.rallydev.com',  //this is the default and may be omitted
        requestOptions: {
            headers: {
                'X-RallyIntegrationName': 'Probot-Rally',    //while optional, it is good practice to
                'X-RallyIntegrationVendor': 'GitHub, Inc',   //provide this header information
                'X-RallyIntegrationVersion': '1.0'
            }
            //any additional request options (proxy options, timeouts, etc.)
        }
    });
