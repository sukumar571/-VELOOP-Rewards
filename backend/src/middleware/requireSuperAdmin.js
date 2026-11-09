// Middleware to ensure the requester is a super admin
// Assumes that `authenticate` and `requireAdmin` have already run and populated `req.auth`
// `req.auth.role` should be a string like 'admin' or 'superadmin'
module.exports = (req, res, next) => {
  if (req.auth && req.auth.role === 'superadmin') {
    return next();
  }
  return res.status(403).json({ error: 'Super admin privileges required' });
};
