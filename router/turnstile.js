// turnstile-actions.js (CommonJS)
// Exports two async functions: runGet({ req, solveBypass }) and runPost({ req, solveBypass })
// Each function returns the same response object shape seperti original.

function validateNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, message: `${name} parameter must be a non-empty string` };
  }
  return { ok: true, value: value.trim() };
}

async function runGet({ req, solveBypass }) {
  const { url, sitekey } = (req && req.query) || {};

  if (!url) {
    return { status: false, error: 'URL parameter is required', code: 400 };
  }

  if (!sitekey) {
    return { status: false, error: 'Sitekey parameter is required', code: 400 };
  }

  const urlCheck = validateNonEmptyString(url, 'URL');
  if (!urlCheck.ok) return { status: false, error: urlCheck.message, code: 400 };

  const sitekeyCheck = validateNonEmptyString(sitekey, 'Sitekey');
  if (!sitekeyCheck.ok) return { status: false, error: sitekeyCheck.message, code: 400 };

  // Validasi format URL
  try {
    new URL(urlCheck.value);
  } catch {
    return { status: false, error: 'Invalid URL format', code: 400 };
  }

  try {
    if (typeof solveBypass !== 'function') {
      return { status: false, error: 'solveBypass is required and must be a function', code: 500 };
    }

    const bypass = await solveBypass();
    if (!bypass || typeof bypass.solveTurnstileMin !== 'function') {
      return { status: false, error: 'Invalid solveBypass implementation', code: 500 };
    }

    const token = await bypass.solveTurnstileMin(urlCheck.value, sitekeyCheck.value);

    if (!token) {
      return { status: false, error: 'Failed to solve Turnstile challenge', code: 500 };
    }

    return {
      status: true,
      data: {
        url: urlCheck.value,
        sitekey: sitekeyCheck.value,
        token: token,
        solvedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return { status: false, error: (error && error.message) || 'Failed to solve Turnstile challenge', code: 500 };
  }
}

async function runPost({ req, solveBypass }) {
  const { url, sitekey } = (req && req.body) || {};

  if (!url) {
    return { status: false, error: 'URL parameter is required', code: 400 };
  }

  if (!sitekey) {
    return { status: false, error: 'Sitekey parameter is required', code: 400 };
  }

  const urlCheck = validateNonEmptyString(url, 'URL');
  if (!urlCheck.ok) return { status: false, error: urlCheck.message, code: 400 };

  const sitekeyCheck = validateNonEmptyString(sitekey, 'Sitekey');
  if (!sitekeyCheck.ok) return { status: false, error: sitekeyCheck.message, code: 400 };

  // Validasi format URL
  try {
    new URL(urlCheck.value);
  } catch {
    return { status: false, error: 'Invalid URL format', code: 400 };
  }

  try {
    if (typeof solveBypass !== 'function') {
      return { status: false, error: 'solveBypass is required and must be a function', code: 500 };
    }

    const bypass = await solveBypass();
    if (!bypass || typeof bypass.solveTurnstileMin !== 'function') {
      return { status: false, error: 'Invalid solveBypass implementation', code: 500 };
    }

    const token = await bypass.solveTurnstileMin(urlCheck.value, sitekeyCheck.value);

    if (!token) {
      return { status: false, error: 'Failed to solve Turnstile challenge', code: 500 };
    }

    return {
      status: true,
      data: {
        url: urlCheck.value,
        sitekey: sitekeyCheck.value,
        token: token,
        solvedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return { status: false, error: (error && error.message) || 'Failed to solve Turnstile challenge', code: 500 };
  }
}

module.exports = {
  runGet,
  runPost,
};