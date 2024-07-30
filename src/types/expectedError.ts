/**
 * An {@link Error} thrown by application code due to expected reasons such as invalid inputs.
 */
export default class ExpectedError extends Error {
  constructor(message?: string) {
    super(message);
    console.log(`ExpectedError: ${message}`);
  }
}
