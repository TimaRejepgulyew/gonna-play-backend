export const errorCodes = {
  USER_NOT_CREATED: {
    code: 404,
    message: "Couln't create user",
  },
  USER_NOT_FOUND: {
    code: 404,
    message: "User not found",
  },
  USER_EMAIL_DUPLICATED: {
    code: 400,
    message: "User with this email already exists",
  },
  PLAYER_NOT_CREATED: {
    code: 404,
    message: "Couln't create player",
  },
  PLAYER_NOT_FOUND: {
    code: 404,
    message: "Player not found",
  },

  // --- Auth / RBAC ---
  AUTH_INVALID_CREDENTIALS: { code: 401, message: "Invalid email or password" },
  AUTH_TOKEN_INVALID: { code: 401, message: "Invalid or missing token" },
  AUTH_TOKEN_EXPIRED: { code: 401, message: "Token expired" },
  AUTH_FORBIDDEN: { code: 403, message: "Insufficient permissions" },
  PLAYER_PROFILE_REQUIRED: {
    code: 403,
    message: "Player profile is required for this action",
  },
  AUTH_PROVIDER_TOKEN_INVALID: {
    code: 401,
    message: "Provider token is invalid or expired",
  },
  AUTH_PROVIDER_NOT_CONFIGURED: {
    code: 503,
    message: "Login provider is not configured",
  },
  AUTH_PROVIDER_UNAVAILABLE: {
    code: 503,
    message: "Login provider is temporarily unavailable",
  },
  AUTH_IDENTITY_ALREADY_LINKED: {
    code: 409,
    message: "This account is already linked to another user",
  },
  AUTH_PROVIDER_ALREADY_LINKED: {
    code: 409,
    message: "This login provider is already linked to your account",
  },
  AUTH_IDENTITY_NOT_FOUND: { code: 404, message: "Login method is not linked" },
  AUTH_LAST_LOGIN_METHOD: {
    code: 409,
    message: "Cannot unlink the only remaining login method",
  },
  AUTH_LINK_TICKET_INVALID: {
    code: 401,
    message: "Confirmation ticket is invalid or expired",
  },
  AUTH_LINK_PROOF_REQUIRED: {
    code: 400,
    message: "Password or another linked login method is required",
  },

  // --- Location / Field ---
  LOCATION_NOT_FOUND: { code: 404, message: "Location not found" },
  LOCATION_HAS_MATCHES: {
    code: 409,
    message: "Location has fields with matches and cannot be deleted",
  },
  FIELD_NOT_FOUND: { code: 404, message: "Field not found" },
  FIELD_HAS_MATCHES: {
    code: 409,
    message: "Field has matches and cannot be deleted",
  },

  // --- Match ---
  MATCH_NOT_FOUND: { code: 404, message: "Match not found" },
  MATCH_NOT_OPEN: { code: 409, message: "Match is not open for participation" },
  MATCH_NOT_EDITABLE: {
    code: 409,
    message: "Match cannot be edited in its current status",
  },
  MATCH_FORMAT_MISMATCH: {
    code: 400,
    message: "Match format does not match the field format",
  },
  MATCH_INVALID_TRANSITION: {
    code: 409,
    message: "Invalid match status transition",
  },
  MATCH_MIN_PLAYERS_NOT_REACHED: {
    code: 409,
    message: "Minimum number of players has not been reached",
  },
  MATCH_PLAYERS_RANGE_INVALID: {
    code: 400,
    message: "Invalid players range",
  },
  MATCH_SKILL_RANGE_INVALID: {
    code: 400,
    message: "Invalid skill range",
  },
  CHECK_IN_NOT_ALLOWED: {
    code: 409,
    message: "Check-in is not allowed in the current match status",
  },
  MATCH_NOT_FINISHED: { code: 409, message: "Match is not finished yet" },

  // --- Participation ---
  PARTICIPANT_NOT_FOUND: { code: 404, message: "Match participant not found" },
  PARTICIPANT_ALREADY_JOINED: {
    code: 409,
    message: "Player already joined or invited to this match",
  },
  PARTICIPANT_INVALID_TRANSITION: {
    code: 409,
    message: "Invalid participant status transition",
  },
  FORBIDDEN_NOT_ORGANIZER: {
    code: 403,
    message: "Only the match organizer can perform this action",
  },
  NOT_MATCH_PARTICIPANT: {
    code: 403,
    message: "Player is not a confirmed participant of this match",
  },

  // --- Rating ---
  RATING_ALREADY_EXISTS: {
    code: 409,
    message: "You have already rated this player for this match",
  },
  RATING_SELF_NOT_ALLOWED: { code: 400, message: "You cannot rate yourself" },
  RATING_NOT_FOUND: { code: 404, message: "Rating not found" },

  // --- Role ---
  ROLE_NOT_FOUND: { code: 404, message: "Role not found" },
  ROLE_NAME_DUPLICATED: {
    code: 400,
    message: "Role with this name already exists",
  },
  ROLE_ALREADY_ASSIGNED: {
    code: 409,
    message: "Role already assigned to this user",
  },

  // --- Infrastructure ---
  INTERNAL_SERVER_ERROR: { code: 500, message: "Internal server error" },
  ROUTE_NOT_FOUND: { code: 404, message: "Route not found" },
  RATE_LIMIT_EXCEEDED: {
    code: 429,
    message: "Too many requests, please try again later",
  },
};
