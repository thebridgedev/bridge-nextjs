# bridge Nextjs plugin

This repository contains both the bridge Next.js library and a demo application showcasing its features. To get started have a look at the following link on the [github repo](https://github.com/nebulr-group/bridge-nextjs/blob/main/README.md)


## What is bridge?

bridge is a powerful service that  provides essential features such as authentication, feature flags, and team management, making it easier for developers to build robust and scalable applications. With bridge, you can streamline your development process and focus on delivering value to your users.

## Route protection

- **Hosted login** (no `loginRoute`): the session is a cookie, and the `withBridgeAuth` middleware is the route guard. It enforces unmatched routes under `defaultAccess: 'protected'` and any rule without `public: true`. It verifies the session token: its PS256 signature against the Bridge JWKS (`<apiBaseUrl>/auth/.well-known/jwks.json`), issuer `<apiBaseUrl>/auth`, audience containing your `appId`, and expiry; a failed check denies.
- **SDK auth** (`<LoginForm />`, `loginRoute` set): tokens live in the browser, where middleware cannot see them. `withBridgeAuth` steps aside for those requests (it is not authoritative there), and `<ProtectedRoute>` plus your API are the guards.
- **Neither route guard is authorization.** Every API route must verify the user's token itself.

See [Route guards](https://thebridge.dev/docs/auth/securing/route-guards/#which-layer-guards-what).
