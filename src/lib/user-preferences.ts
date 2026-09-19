export type UserPreferences = {
  sidebarInitiallyCollapsed: boolean;
  reduceMotion: boolean;
  pdfInspectorInitiallyOpen: boolean;
  pdfInspectorAutoOpen: boolean;
};

export const USER_PREFERENCES_KEY = "uniflow:user-preferences";
export const USER_PREFERENCES_CHANGED_EVENT = "uniflow:user-preferences-changed";

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  sidebarInitiallyCollapsed: false,
  reduceMotion: false,
  pdfInspectorInitiallyOpen: true,
  pdfInspectorAutoOpen: true,
};

export function readUserPreferences(): UserPreferences {
  if (typeof window === "undefined") return DEFAULT_USER_PREFERENCES;
  try {
    const stored = window.localStorage.getItem(USER_PREFERENCES_KEY);
    if (!stored) return DEFAULT_USER_PREFERENCES;
    const parsed = JSON.parse(stored) as Partial<UserPreferences>;
    return {
      sidebarInitiallyCollapsed: typeof parsed.sidebarInitiallyCollapsed === "boolean"
        ? parsed.sidebarInitiallyCollapsed
        : DEFAULT_USER_PREFERENCES.sidebarInitiallyCollapsed,
      reduceMotion: typeof parsed.reduceMotion === "boolean"
        ? parsed.reduceMotion
        : DEFAULT_USER_PREFERENCES.reduceMotion,
      pdfInspectorInitiallyOpen: typeof parsed.pdfInspectorInitiallyOpen === "boolean"
        ? parsed.pdfInspectorInitiallyOpen
        : DEFAULT_USER_PREFERENCES.pdfInspectorInitiallyOpen,
      pdfInspectorAutoOpen: typeof parsed.pdfInspectorAutoOpen === "boolean"
        ? parsed.pdfInspectorAutoOpen
        : DEFAULT_USER_PREFERENCES.pdfInspectorAutoOpen,
    };
  } catch {
    return DEFAULT_USER_PREFERENCES;
  }
}

export function writeUserPreferences(preferences: UserPreferences) {
  window.localStorage.setItem(USER_PREFERENCES_KEY, JSON.stringify(preferences));
  window.dispatchEvent(new CustomEvent<UserPreferences>(USER_PREFERENCES_CHANGED_EVENT, {
    detail: preferences,
  }));
}
