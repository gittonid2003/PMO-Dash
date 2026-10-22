const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  // Deliberately fatal at startup rather than a warning: a short or
  // missing secret means session tokens could be forged. Better to
  // refuse to start than to silently run insecurely.
  throw new Error(
    'JWT_SECRET is missing or too short. Set a random string of 32+ characters ' +
    'as the JWT_SECRET environment variable before starting the server. ' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
}

const SESSION_DAYS = 30;

function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signSessionToken(sessionId) {
  return jwt.sign({ sid: sessionId }, JWT_SECRET, { expiresIn: SESSION_DAYS + 'd' });
}

function verifySessionToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, signSessionToken, verifySessionToken, SESSION_DAYS };
