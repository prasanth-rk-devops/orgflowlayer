const { z } = require('zod');
const validate = require('../src/middleware/validate');

describe('validate middleware', () => {
  const mw = validate({ body: z.object({ email: z.string().email() }) });

  test('passes valid body', () => {
    const next = jest.fn();
    mw({ body: { email: 'a@b.co' } }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('rejects invalid body with 400 and field details', () => {
    const next = jest.fn();
    mw({ body: { email: 'bad' } }, {}, next);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.details[0].field).toBe('email');
  });
});
