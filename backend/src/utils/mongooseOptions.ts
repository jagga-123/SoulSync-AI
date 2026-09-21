/** Shared `toJSON` options: expose a clean `id`, hide `_id` / `__v`. */
export const toJSONOptions = {
  virtuals: true,
  transform(_doc: unknown, ret: Record<string, unknown>) {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
};
