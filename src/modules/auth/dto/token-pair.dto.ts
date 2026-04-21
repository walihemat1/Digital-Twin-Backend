export class TokenPairDto {
  accessToken!: string;
  refreshToken!: string;
}

/**
 * --------------------------------------------------------------------------
 * Purpose of this File (`token-pair.dto.ts`)
 * --------------------------------------------------------------------------
 *
 * This file defines the `TokenPairDto` class, which is used to represent a pair of access and refresh tokens.
 *
 * Why we need it:
 * - The `TokenPairDto` is used to represent a pair of access and refresh tokens.
 * - The `TokenPairDto` is used to return the access and refresh tokens to the client.
 * - The `TokenPairDto` is used to validate the access and refresh tokens.
 */
