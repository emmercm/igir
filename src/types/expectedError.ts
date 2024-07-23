/**
 * An {@link Error} thrown by application code due to expected reasons such as invalid inputs.
 */
export default class ExpectedError extends Error {
  constructor(message?: string) {
    console.log(`ExpectedError: ${message}`);
    super(message);
  }
}
