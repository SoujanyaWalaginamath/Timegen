# TODO

- [ ] Implement real user creation in POST `/signup`:
  - [ ] Hash password with bcrypt
  - [ ] Create Mongo user document via `User.create()` / `new User().save()`
  - [ ] Enforce duplicate email handling (return 409 on unique conflict)
- [ ] Align field mapping:
  - [ ] Frontend sends `{ name, email, password, department }`
  - [ ] Backend should store `username = name`
- [ ] Keep both entrypoints consistent (`server.js` and `backend/server.js`) so whichever is deployed/used works.
- [ ] Restart backend/server and test:
  - [ ] Sign up -> expect success
  - [ ] Login -> expect user found
  - [ ] Verify Mongo contains created user

