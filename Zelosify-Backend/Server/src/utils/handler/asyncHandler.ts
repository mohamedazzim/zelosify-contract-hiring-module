import type { Request, Response, RequestHandler, NextFunction } from "express";

/**
 * Async handler utility that wraps async route handlers to catch errors automatically
 * 
 * @description Eliminates the need for try-catch blocks in every async route handler
 * by automatically catching any rejected promises and passing them to Express error middleware
 * 
 * @param fn - The async function to wrap (supports both 2-param and 3-param signatures)
 * @returns Express RequestHandler that automatically handles promise rejections
 * 
 * @example
 * ```typescript
 * // For simple controllers (2 parameters)
 * export const getUserProfile = asyncHandler(
 *   async (req: Request, res: Response): Promise<void> => {
 *     const user = await userService.getProfile(req.params.id);
 *     res.json(user);
 *   }
 * );
 * 
 * // For middleware or complex handlers (3 parameters)
 * export const validateUser = asyncHandler(
 *   async (req: Request, res: Response, next: NextFunction): Promise<void> => {
 *     const isValid = await userService.validate(req.user.id);
 *     if (isValid) next();
 *     else res.status(401).json({ error: 'Invalid user' });
 *   }
 * );
 * ```
 */
export const asyncHandler = (
  fn: ((req: Request, res: Response) => Promise<void>) | 
      ((req: Request, res: Response, next: NextFunction) => Promise<void>)
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default asyncHandler;
