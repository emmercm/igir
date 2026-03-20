import { Ajv } from 'ajv';

import outputTokensData from '../../src/types/outputTokens.json' with { type: 'json' };
import schema from '../../src/types/outputTokens.schema.json' with { type: 'json' };

const ajv = new Ajv();

describe('outputTokens.json', () => {
  it('should adhere to its schema', () => {
    const validate = ajv.compile(schema);
    const valid = validate(outputTokensData);
    expect(validate.errors).toBeNull();
    expect(valid).toBe(true);
  });
});
