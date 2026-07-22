import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.locator('input[type="email"]').first();
    this.passwordInput = page.locator('input[type="password"]').first();
    this.submitButton = page.locator('form button[type="submit"]').first();
    this.errorMessage = page.locator('text=/error|failed/i').first();
  }

  async login(email: string, password: string): Promise<void> {
    // Check if already logged in
    const currentUrl = this.page.url();
    if (currentUrl.includes('/inbox')) {
      console.log('Already on inbox page, skipping login');
      return;
    }

    await this.emailInput.waitFor({ state: 'visible', timeout: 5000 });
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    
    // Set up login response listener BEFORE clicking - catch ALL responses to /auth/login
    const loginResponsePromise = this.page.waitForResponse(
      (response) => {
        const url = response.url();
        // Check for /auth/login endpoint - catch all status codes
        const isLoginEndpoint = url.includes('/auth/login');
        if (isLoginEndpoint) {
          console.log(`Caught login response: ${response.status()} for ${url}`);
        }
        return isLoginEndpoint;
      },
      { timeout: 5000 } // Fail fast - 5 seconds max
    );
    
    // Click submit button
    await this.submitButton.click();
    
    // Wait for login response (success or failure)
    let loginResponse;
    try {
      loginResponse = await loginResponsePromise;
      console.log(`Login API response status: ${loginResponse.status()}`);
    } catch (error: any) {
      // Check for error message on page if API call timed out
      await this.page.waitForTimeout(1000);
      const errorVisible = await this.errorMessage.isVisible({ timeout: 1000 }).catch(() => false);
      if (errorVisible) {
        const errorText = await this.errorMessage.textContent();
        console.log(`Login error on page: ${errorText}`);
        throw new Error(`Login failed: ${errorText}`);
      }
      throw new Error(`Login timed out after 5 seconds. Make sure the server is running and responding.`);
    }
    
    // Check if login was successful (200/201) or failed (401/403)
    const status = loginResponse.status();
    console.log(`Login HTTP status: ${status}`);
    
    if (status === 401 || status === 403) {
      // Wait a moment for error message to appear on page
      await this.page.waitForTimeout(1000);
      
      // Check for error message on page
      const errorVisible = await this.errorMessage.isVisible({ timeout: 2000 }).catch(() => false);
      if (errorVisible) {
        const errorText = await this.errorMessage.textContent();
        console.log(`Login error message on page: ${errorText}`);
        throw new Error(`Login failed: ${errorText}`);
      }
      
      // Try to get error from response body
      try {
        const errorBody = await loginResponse.json();
        console.log(`Login error body:`, JSON.stringify(errorBody));
        const errorMsg = errorBody.message || errorBody.error || 'Authentication failed';
        throw new Error(`Login failed: ${errorMsg} (HTTP ${status})`);
      } catch (jsonError) {
        // If we can't parse JSON, try to get text
        try {
          const errorText = await loginResponse.text();
          console.log(`Login error text: ${errorText.substring(0, 200)}`);
          throw new Error(`Login failed: ${errorText.substring(0, 200)} (HTTP ${status})`);
        } catch {
          throw new Error(`Login failed: Authentication failed (HTTP ${status})`);
        }
      }
    }
    
    console.log(`Login successful, status: ${status}`);
    
    // If successful, wait for navigation to inbox (should be fast)
    try {
      await this.page.waitForURL('**/inbox**', { timeout: 5000 });
    } catch (error: any) {
      // Check if we're already on inbox
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/inbox')) {
        throw new Error(`Login succeeded but did not navigate to inbox. Current URL: ${currentUrl}`);
      }
    }

    // Entering Triage is free in the guided flow (High-and-above emails show
    // directly) — the distraction friction now only fires when the user opts to
    // peek at lower-priority emails, which these tests don't do. No gate to clear.
  }

  async isLoggedIn(): Promise<boolean> {
    try {
      await this.page.waitForURL('**/inbox**', { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  async register(email: string, password: string, name: string): Promise<void> {
    // Look for the toggle button that says "Don't have an account? Sign up"
    const registerToggle = this.page.getByText("Don't have an account? Sign up").first();
    
    try {
      if (await registerToggle.count() > 0) {
        await registerToggle.click();
        await this.page.waitForTimeout(1000); // Wait for form to update to register mode
      }
    } catch {
      // Toggle might not be found, try alternative selectors
      const altToggle = this.page.locator('button').filter({ hasText: /Sign up/i }).first();
      if (await altToggle.count() > 0) {
        await altToggle.click();
        await this.page.waitForTimeout(1000);
      }
    }

    // Fill in registration form - name field appears when in register mode
    // Try multiple selectors for name input
    const nameInputSelectors = [
      'input[type="text"]:not([type="email"]):not([type="password"])',
      'input[name="name"]',
      'input[placeholder*="name" i]',
    ];
    
    let nameInput: Locator | null = null;
    for (const selector of nameInputSelectors) {
      const input = this.page.locator(selector).first();
      if (await input.count() > 0) {
        nameInput = input;
        break;
      }
    }

    if (nameInput) {
      try {
        await nameInput.waitFor({ state: 'visible', timeout: 5000 });
        await nameInput.fill(name);
      } catch {
        console.log('Name input not found or not visible, skipping');
      }
    }

    await this.emailInput.waitFor({ state: 'visible', timeout: 5000 });
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    
    // Wait for registration API call - set up BEFORE clicking - fail fast
    // Track all responses to see what's happening
    const registerPromise = this.page.waitForResponse(
      (response) => {
        const url = response.url();
        return url.includes('/auth/register') || url.includes('/register');
      },
      { timeout: 5000 } // Fail fast - 5 seconds max
    );
    
    await this.submitButton.click();
    
    // Wait for registration response
    let registerResponse;
    try {
      registerResponse = await registerPromise;
      console.log(`Registration response status: ${registerResponse.status()}`);
    } catch (error: any) {
      // Check for error message on page if API call timed out
      await this.page.waitForTimeout(1000); // Give time for error to appear
      const errorVisible = await this.errorMessage.isVisible({ timeout: 1000 }).catch(() => false);
      if (errorVisible) {
        const errorText = await this.errorMessage.textContent();
        console.log(`Registration error on page: ${errorText}`);
        throw new Error(`Registration failed: ${errorText}`);
      }
      throw new Error(`Registration timed out after 5 seconds. Make sure the server is running and responding.`);
    }
    
    // Check if registration was successful
    const status = registerResponse.status();
    console.log(`Registration HTTP status: ${status}`);
    
    if (status !== 201 && status !== 200) {
      // Wait a moment for error message to appear on page
      await this.page.waitForTimeout(1000);
      
      // Check for error message on page
      const errorVisible = await this.errorMessage.isVisible({ timeout: 2000 }).catch(() => false);
      if (errorVisible) {
        const errorText = await this.errorMessage.textContent();
        console.log(`Registration error message on page: ${errorText}`);
        throw new Error(`Registration failed: ${errorText}`);
      }
      
      // Try to get error from response body
      try {
        const errorBody = await registerResponse.json();
        console.log(`Registration error body:`, JSON.stringify(errorBody));
        const errorMsg = errorBody.message || errorBody.error || 'Registration failed';
        throw new Error(`Registration failed: ${errorMsg} (HTTP ${status})`);
      } catch (jsonError) {
        // If we can't parse JSON, try to get text
        try {
          const errorText = await registerResponse.text();
          console.log(`Registration error text: ${errorText}`);
          throw new Error(`Registration failed: ${errorText.substring(0, 200)} (HTTP ${status})`);
        } catch {
          throw new Error(`Registration failed: HTTP ${status}`);
        }
      }
    }
    
    console.log(`Registration successful, status: ${status}`);
    
    // If successful, wait for navigation to inbox (should be fast)
    try {
      await this.page.waitForURL('**/inbox**', { timeout: 5000 });
    } catch (error: any) {
      // Check if we're already on inbox
      const currentUrl = this.page.url();
      if (currentUrl.includes('/inbox')) {
        return;
      }
      throw new Error(`Registration succeeded but did not navigate to inbox. Current URL: ${currentUrl}`);
    }
  }
}

