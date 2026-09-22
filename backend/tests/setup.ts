// Unit tests exercise pure logic only; these values satisfy env validation
// without requiring a live database.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/secure_portal_test';
process.env.SESSION_SECRET_OR_PEPPER ??= 'test-pepper-value-that-is-long-enough-1234567890';
process.env.PASSWORD_MIN_LENGTH ??= '12';
