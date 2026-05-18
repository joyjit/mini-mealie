import { defineWebExtConfig } from 'wxt';

export default defineWebExtConfig({
    // Persist Chrome profile data across dev sessions
    // This allows the extension to remember logins, settings, etc.
    chromiumArgs: ['--user-data-dir=./.wxt/chrome-data'],

    // Firefox: dedicated profile under .wxt/ (gitignored) so dev does not use your default profile.
    firefoxProfile: '.wxt/firefox-dev',
    keepProfileChanges: true,

    // Auto-open useful pages for development
    startUrls: [
        'https://www.allrecipes.com/recipe/286369/cheesy-ground-beef-and-potatoes/',
        'https://www.katheats.com/homemade-nutty-granola-recipe',
        'https://example.com', // Non-recipe page for testing detection behavior
    ],
});
