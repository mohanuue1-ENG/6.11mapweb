// How risky each audit action is, so the platform owner can see what needs a look.
//   high    something failed, was removed, or changes money, plans or who may use the platform
//   medium  access and password changes, and edits to records
//   low     everything else (normal daily work)
const HIGH = [
  'ACCOUNT_BLOCKED', 'USER_STATUS_CHANGED', 'ACCOUNT_UNBLOCKED', 'LOGIN_FAILED', 'PASSWORD_CHANGE_FAILED', 'COMPANY_STATUS_CHANGED', 'DRIVER_ACCOUNT_DELETED', 'TRUCK_DELETED', 'DRIVER_DELETED',
  'TRIP_DELETED', 'LOAD_DELETED', 'PAYMENT_RECORDED', 'SUBSCRIPTION_CHANGED', 'PLAN_UPDATED', 'REGISTRATION_APPROVED', 'REGISTRATION_REJECTED',
];
const MEDIUM = [
  'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'PASSWORD_SET', 'LOGIN_CODE_SENT', 'DISPATCHER_CREATED', 'DISPATCHER_STATUS',
  'PLAN_CREATED', 'COMPANY_UPDATED', 'COMPANY_CREATED', 'TRIP_DISTANCE_RECALCULATED', 'TRUCK_UPDATED', 'DRIVER_UPDATED', 'LOAD_UPDATED', 'ASSIGNMENT_ENDED',
];
export const RISK_ACTIONS = { high: HIGH, medium: MEDIUM };
export const riskOf = (action) => (HIGH.includes(action) ? 'high' : MEDIUM.includes(action) ? 'medium' : 'low');
