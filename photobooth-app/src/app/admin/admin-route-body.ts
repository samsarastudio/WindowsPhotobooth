const ADMIN_BODY_CLASS = 'pb-admin-route';

export function enterAdminRoute(): void {
  document.body.classList.add(ADMIN_BODY_CLASS);
}

export function leaveAdminRoute(): void {
  document.body.classList.remove(ADMIN_BODY_CLASS);
}
