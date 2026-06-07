# TODO

## Signup performance + duplicate-click fix
- [ ] Update `POST /signup` to respond immediately (do not await email sending).
- [ ] Fix 409 response message to indicate “email already registered”.
- [ ] Update `frontend/signup.html` to prevent double-submit (disable button on first click).
- [ ] Ensure: first click shows success message after account creation; double click should not show “already registered” due to second request.
- [ ] Test: new email signup, existing email signup, and double-click behavior.

