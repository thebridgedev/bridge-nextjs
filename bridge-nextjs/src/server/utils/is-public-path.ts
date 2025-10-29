/**
 * Checks if a path is public (does not require authentication)
 * 
 * @param path The path to check
 * @returns True if the path is public, false otherwise
 */
export function isPublicPath(path: string): boolean {
  // List of paths that don't require authentication
  const publicPaths = [
    '/login',    
    '/_next',
    '/static',
    '/favicon.ico',
  ];

  // Check if the path starts with any of the public paths
  return publicPaths.some(publicPath => path.startsWith(publicPath));
} 