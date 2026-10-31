declare module 'zcatalyst-sdk-node' {
  const catalyst: { initialize: (req: unknown, opts?: { scope?: 'admin' | 'user' }) => any }
  export default catalyst
}
