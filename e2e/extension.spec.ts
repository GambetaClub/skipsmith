import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium, expect, test } from "@playwright/test"

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist")

test("unpacked extension opens its popup and options", async () => {
  const userDataDir = await mkdtemp(path.join(tmpdir(), "skipsmith-"))
  const context = await chromium.launchPersistentContext(userDataDir, {
    // The headless shell cannot load extensions. A headed Chromium can, including under Xvfb.
    headless: false,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      "--no-first-run",
      "--disable-default-apps",
    ],
  })

  try {
    let worker = context.serviceWorkers()[0]
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15_000 })
    const extensionId = new URL(worker.url()).host

    const options = await context.newPage()
    await options.goto(`chrome-extension://${extensionId}/options/options.html`)
    await expect(options.getByRole("heading", { name: "What should be skipped" })).toBeVisible()
    await expect(options.getByRole("heading", { name: "Sponsor", exact: true })).toBeVisible()
    const sponsorAuto = options.locator('input[name="sponsor"][value="auto"]')
    await expect(sponsorAuto).toBeChecked()
    await options.locator('input[name="sponsor"][value="button"]').check()
    await expect(options.locator('input[name="sponsor"][value="button"]')).toBeChecked()
    await expect(options.getByText("Saved on this browser.")).toBeVisible()
    await expect(options.getByText("CC BY-NC-SA 4.0")).toBeVisible()

    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`)
    await expect(popup.getByRole("heading", { name: "Skipsmith" })).toBeVisible()
    await expect(popup.getByRole("button", { name: "On" })).toHaveAttribute("aria-pressed", "true")
    await popup.getByRole("button", { name: "On" }).click()
    await expect(popup.getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "false")
    await expect(popup.getByText("No video open")).toBeVisible()
    await expect(popup.getByText(/CC BY-NC-SA 4.0/)).toBeVisible()

    await options.bringToFront()
    await expect(options.locator('input[name="sponsor"][value="button"]')).toBeChecked()
  } finally {
    await context.close()
    await rm(userDataDir, { recursive: true, force: true })
  }
})
