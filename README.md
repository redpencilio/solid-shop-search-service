# solid-sync-service

Synchronize data between Solid PODs and a triple store.

## Tasks

This service makes use of tasks to get notified about the changes it has to synchronize.

A task looks like this:

```
?task a ext:Task;
    ext:taskType ?taskType;
    ext:dataFlow ?dataFlow;
    ext:taskStatus ?taskStatus.
```

### Task types

- `ext:SavedOrderTask`, `ext:UpdatedOrderTask` and `ext:SyncOfferingsTask`: the default tasks. Can be changed by overwriting the `config/` configuration.

### Data flow

- `ext:PodToDb`: the data flow is from the POD to the triple store.
  - `extractTriples` needs to get the insert/delete triples from the POD and then the service will insert/delete them into the triple store.
  - output of `extractTriples` has to be an array with the following structure: `[{graph, deleteTriples: [ { subject: {value, termType}, predicate: {value, termType}, object: {value, termType} } ], insertTriples }, ...]`
- `ext:DbToPod`: the data flow is from the triple store to the POD.
  - `extractTriples` needs to get the insert/delete triples from the triple store and then the service will insert/delete them into the POD.
  - output of `extractTriples` has to be an array with the following structure: `[{uri, webId, deleteTriples: [ { s: {value, type}, p: {value, type}, o: {value, type} } ], insertTriples }, ...]`

### Task status

- `"pending"`: the task is pending.
- `"done"`: the task is done.
- `"failed"`: the task failed.

What is written in the triple store can be changed, however, make sure to use the `TaskStatus` enum to make sure the generic code understands the task status.

### Extra data

Additional triples can be added to the task to pass extra information needed to be able to solve the task.

## Add this service to your stack

Update your `docker-compose.yml` file to add this service to your stack. See "Setup ESS" below for more information.

```yaml
sync:
  image: redpencil/solid-sync-service:latest
  environment:
    NODE_ENV: "production"
    ESS_CLIENT_ID: "your application's client id"
    ESS_CLIENT_SECRET: "your application's client secret"
    ESS_IDP: "https://login.inrupt.com"
    MU_SPARQL_ENDPOINT: "http://triplestore:8890/sparql"
  links:
    - database:database
```

Add the following to your `dispatcher.ex` file:

```elixir
  match "/auth/*path", @json do
    Proxy.forward conn, path, "http://sync/auth/"
  end
```

Add the following to your `delta/rules.js` file:

```javascript
{
    match: {
      predicate: {
        type: 'uri',
        value: 'http://mu.semte.ch/vocabularies/ext/taskType'
      }
    },
    callback: {
      url: 'http://sync/delta',
      method: 'POST'
    },
    options: {
      resourceFormat: "v0.0.1",
      gracePeriod: 1000, // 1 seconds
      ignoreFromSelf: true
    }
  }
```

Overwrite the files in `config/` to change the default tasks, make sure to only change the body of the functions. The filenames and the function headers have to stay the same.

## Authentication flow

To be able to read and write to the specific resources in the user's POD, authentication and permissions to those resources are required.
As there is no Solid spec for this yet at the time of writing, non-spec behavior is used from the supported servers.

### CSS

[Non-spec behavior of CSS.](https://communitysolidserver.github.io/CommunitySolidServer/4.0/client-credentials/)

To authenticate once, following flow is recommended:
- **user ---> frontend**
  - enters `email`, `password` and `IDP URL`
- **frontend ---> CSS IDP**
  - sends `email`, `password` and `name='solid-shop'` to the CSS IDP at `${IDPURL}/idp/credentials`
  - generates a token
  - sends back the client id and client secret
- **frontend ---> sync**
  - sends `clientWebId`, `clientId`, `clientSecret`, `idpUrl` and `idpType='css'` to this solid-sync-service at `/auth/credentials`
  - saves the credentials to the triple store

On reading from or writing to the user's POD:
- **sync ---> CSS IDP**
  - sends `clientId`, `clientSecret` to the CSS IDP at `${IDPURL}/.oidc/token`
  - requests access token
- **sync ---> user's POD**
  - uses the access token to send authenticated requests to the user's POD

### ESS

Uses [Access Policies: Universal API](https://docs.inrupt.com/developer-tools/javascript/client-libraries/tutorial/manage-access-policies/#change-agent-access) in the frontend and [Authenticate with Statically Registered Client Credentials](https://docs.inrupt.com/developer-tools/javascript/client-libraries/tutorial/authenticate-nodejs-script/#authenticate-with-statically-registered-client-credentials) in the backend.

To authenticate once, following flow is recommended:
- **user ---> frontend**
  - clicks the `Login` button
- **frontend ---> sync**
  - GET /auth/ess/webId
  - gets the application's ESS WebId which is needed in the next step
- **frontend ---> ESS IDP**
  - sends access requests using the `@inrupt/solid-client` library for the needed resources
- **frontend ---> sync**
  - sends `clientWebId` and `idpType='ess'` to this solid-sync-service at `/auth/credentials`
  - saves the credentials (just `idpType` for ESS) to the triple store

On reading from or writing to the user's POD:
- **sync ---> user's POD**
  - on startup of this solid-sync-service, it will log in and create an authenticated session using the `ESS_CLIENT_ID` and `ESS_CLIENT_SECRET` environment variables which will then be used to send authenticated requests to the user's POD
  - uses the authenticated session to send authenticated requests to the user's POD

#### Setup ESS

To be able to support ESS POD users, you have to register your application with the ESS IDP. You can do this at [Inrupt Application Registration](https://login.inrupt.com/registration.html).  
Then, you should fill in the `ESS_CLIENT_ID` and `ESS_CLIENT_SECRET` environment variables in the `docker-compose.yml` file. Also change the `ESS_IDP` environment variable if you had used another ESS IDP.


## Contribution

We make use of [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

When making changes to a pull request, we prefer to update the existing commits with a rebase instead of appending new commits.
