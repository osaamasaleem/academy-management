export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' }
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Access denied: administrator only' }
    });
  }

  next();
};

export default requireAdmin;
