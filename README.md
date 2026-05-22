> [!NOTE]  
> This repository is archived. The current source code for skowt will be staying closed-source for the forseeable future, or unless I ([@dromzeh](https://dromzeh.dev/)) decide to make it open-source again. This is an old API version built on Cloudflare Workers that's kept up for old transparency purposes only.

skowt.cc's backend/api

api subdomain: den.skowt.cc
cdn subdomain: pack.skowt.cc
bridge (cors proxy): bridge.skowt.cc

- better-auth for discord authentication
- turso for db
- r2 for storage
- hono as the backend
- ratelimiting with do
- fully typesafe openapi spec, using scalar to make it pretty
- hosted entirely on cf workers

this code is pretty much self documenting

types for frontend gen (u need to get the yaml file from ref):

`pnpm dlx typed-openapi "skowtcc-api.yaml" -o "api.zod.ts"`

licensed under GNU General Public License v3.0

authored by [@dromzeh](https://dromzeh.dev/)
