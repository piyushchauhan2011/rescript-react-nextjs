export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { readRollout } = await import("./server/rollout");
    try {
      readRollout();
    } catch (error) {
      // Next can retain a listening process after a rejected instrumentation hook.
      // Invalid trusted configuration must terminate startup, not hang requests.
      console.error("Invalid decision configuration:", error);
      process.exit(1);
    }
  }
}
