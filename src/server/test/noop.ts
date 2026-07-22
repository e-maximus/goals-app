// An empty stand-in for the `server-only` marker package. That package throws
// when imported outside a React Server Component; under vitest (plain Node, no
// `react-server` resolve condition) it would fire on any server module the tests
// import, so the server project aliases `server-only` here instead.
export {};
