"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

import { usePathname } from "next/navigation";

type Theme = "dark" | "light";

type ThemeProviderProps = {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
};

type ThemeProviderState = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
    theme: "dark",
    setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
    children,
    defaultTheme = "dark",
    storageKey = "vite-ui-theme",
    ...props
}: ThemeProviderProps) {
    const pathname = usePathname();
    const [theme, setTheme] = useState<Theme>(() => {
        if (typeof window !== "undefined") {
            const stored = localStorage.getItem(storageKey);
            if (stored === "light" || stored === "dark") {
                return stored;
            }
            return defaultTheme;
        }
        return defaultTheme;
    });

    useEffect(() => {
        const root = window.document.documentElement;

        const applyTheme = (targetTheme: "light" | "dark") => {
            root.classList.remove("light", "dark");
            root.removeAttribute("data-theme");
            root.classList.add(targetTheme);
            root.setAttribute("data-theme", targetTheme);
        };

        // Public landing and authentication pages are dark-only.
        // Force 'dark' theme on html root to set appropriate body backgrounds.
        const isDarkOnlyPage = ["/", "/login", "/signup"].includes(pathname || "");
        if (isDarkOnlyPage) {
            applyTheme("dark");
            return;
        }

        applyTheme(theme);
    }, [theme, pathname]);

    const value = {
        theme,
        setTheme: (theme: Theme) => {
            localStorage.setItem(storageKey, theme);
            setTheme(theme);
        },
    };

    return (
        <ThemeProviderContext.Provider {...props} value={value}>
            {children}
        </ThemeProviderContext.Provider>
    );
}

export const useTheme = () => {
    const context = useContext(ThemeProviderContext);

    if (context === undefined)
        throw new Error("useTheme must be used within a ThemeProvider");

    return context;
};
