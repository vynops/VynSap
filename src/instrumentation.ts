export async function register() {
  // Only run in the Node.js runtime (not edge), and only in server context
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/scheduler-runner')
    startScheduler()
  }
}
