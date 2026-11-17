export const requirePermission = (...allowedFlags) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' }
    });
  }

  // Admin / Principal has unrestricted access
  if (req.user.role === 'admin') {
    return next();
  }

  const hasPermission = allowedFlags.some((flag) => req.user[flag] === true);
  if (!hasPermission) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Access denied: insufficient permissions' }
    });
  }

  next();
};

export default requirePermission;
