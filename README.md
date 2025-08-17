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
