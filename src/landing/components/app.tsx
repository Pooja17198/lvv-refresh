/**
 * @license
 * Copyright (c) 2014, 2024, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { registerCustomElement } from "ojs/ojvcomponent";
import { h } from "preact";
import { useEffect, useState, useRef } from "preact/hooks";

import Context = require("ojs/ojcontext");
import CoreRouter = require("ojs/ojcorerouter");
import { Footer } from "./footer";
import { Header } from "./header";
import Content from "./content/index";
import UrlPathParamAdapter = require("ojs/ojurlpathparamadapter");

type Props = {
    appName?: string;
    userLogin?: string;
};

const routeArray: Array<any> = [
    { path: '', redirect: 'home' },
    { path: "rack/{id}", detail: { label: "Rack" } },
    { path: "home",      detail: { label: "Home" } },
];

const router = new CoreRouter<CoreRouter.DetailedRouteConfig>(routeArray, {
    urlAdapter: new UrlPathParamAdapter("/"),
});

type Route = { path: string; id: string };

const pageChangeHandler = (route: Route) => {
    router.go({ path: route.path, params: { id: route.id } });
};

// ─── Session constants ────────────────────────────────────────────────────────
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 60 * 1000; // 5 hours inactivity → logout
const WARNING_BEFORE_MS     = 5 * 60 * 1000;       // show warning 5 min before logout
const TOKEN_REFRESH_MS      = 19 * 60 * 1000;     // refresh IDCS token every 19 min
const RELAUNCH_AUTH_URL     = "/logout";          // force fresh login flow
// (IDCS token expires in 60 min;
//  refresh token expires in 8 hrs)
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
// ─────────────────────────────────────────────────────────────────────────────

export const App = registerCustomElement("app-root", (props: Props) => {
    const [selectedVendor, setSelectedVendor] = useState("XYZ");
    const [selectedRegion, setSelectedRegion] = useState<string>("us-phoenix-1");
    const [showSessionWarning, setShowSessionWarning] = useState(false);
    const [routePath, setRoutePath] = useState<string>('');

    props.appName  = "LVV Portal";
    props.userLogin = sessionStorage.getItem("X-Oracle-Vendor-Email") || "";

    const inactivityTimer   = useRef<ReturnType<typeof setTimeout>  | null>(null);
    const warningTimer      = useRef<ReturnType<typeof setTimeout>  | null>(null);
    const tokenRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const refreshInFlightRef = useRef(false);
    const redirectingRef     = useRef(false);

    // FIX: useRef mirror of showSessionWarning so that the event listener
    // registered once in useEffect always reads the *current* value.
    // Without this, handleUserActivity captures a stale `false` via closure
    // and can never see when the warning is showing.
    const warningVisibleRef = useRef(false);

    const routerUpdated = (actionable: CoreRouter.ActionableState<CoreRouter.DetailedRouteConfig>): void => {
        setRoutePath(actionable.state?.path);
    };

    const vendorChangedHandler = (vendor: string) => setSelectedVendor(vendor);
    const regionChangedHandler = (region: string) => setSelectedRegion(region);

    const redirectToLogin = () => {
        if (redirectingRef.current) return;
        redirectingRef.current = true;
        clearTimers();
        stopTokenRefresh();
        warningVisibleRef.current = false;
        setShowSessionWarning(false);
        window.location.assign(RELAUNCH_AUTH_URL);
    };

    // ─── Token refresh (SPLAT/IDCS callback) ────────────────────────────────────
    const refreshToken = async () => {
        if (refreshInFlightRef.current || redirectingRef.current) return;
        refreshInFlightRef.current = true;
        const refreshUrl = `/callback?refresh&_=${Date.now()}`;

        try {
            const response = await fetch(refreshUrl, {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
                redirect: "follow",
            });

            if (!response.ok) {
                throw new Error(`Refresh failed with status ${response.status}`);
            }
        } catch (err) {
            console.error("Token refresh failed, redirecting to login.", err);
            redirectToLogin();
        } finally {
            refreshInFlightRef.current = false;
        }
    };

    const startTokenRefresh = () => {
        void refreshToken(); // immediate refresh on mount
        tokenRefreshTimer.current = setInterval(() => {
            void refreshToken();
        }, TOKEN_REFRESH_MS);
    };

    const stopTokenRefresh = () => {
        if (tokenRefreshTimer.current) clearInterval(tokenRefreshTimer.current);
    };
    // ─────────────────────────────────────────────────────────────────────────────

    // ─── Inactivity timers ───────────────────────────────────────────────────────
    const clearTimers = () => {
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        if (warningTimer.current)    clearTimeout(warningTimer.current);
    };

    const resetTimers = () => {
        clearTimers();
        warningVisibleRef.current = false;
        setShowSessionWarning(false);

        warningTimer.current = setTimeout(() => {
            warningVisibleRef.current = true;
            setShowSessionWarning(true);
        }, INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS);

        inactivityTimer.current = setTimeout(() => {
            warningVisibleRef.current = false;
            setShowSessionWarning(false);
            redirectToLogin();
        }, INACTIVITY_TIMEOUT_MS);
    };

    const handleUserActivity = () => {
        // FIX: read the ref, not the state — avoids the stale closure problem.
        // If the warning is already visible the user must click "Stay Logged In";
        // random mouse movement alone won't silently reset the clock.
        if (!warningVisibleRef.current) {
            resetTimers();
        }
    };

    const handleStayLoggedIn = () => {
        resetTimers(); // hides warning + gives a fresh 2-hour window
    };
    // ─────────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        Context.getPageContext().getBusyContext().applicationBootstrapComplete();
        setSelectedVendor(sessionStorage.getItem("X-Oracle-Vendor") || "");
        router.currentState.subscribe(routerUpdated);
        router.sync();

        startTokenRefresh();
        resetTimers();
        ACTIVITY_EVENTS.forEach(event =>
            document.addEventListener(event, handleUserActivity, { passive: true })
        );

        return () => {
            clearTimers();
            stopTokenRefresh();
            ACTIVITY_EVENTS.forEach(event =>
                document.removeEventListener(event, handleUserActivity)
            );
        };
    }, []); // runs once on mount

    return (
        <div id="appContainer" class="oj-web-applayout-page">
            <Header
                appName={props.appName}
                userLogin={props.userLogin}
                vendorName={selectedVendor}
                regionValue={selectedRegion}
                onRegionChanged={regionChangedHandler}
            />
            <Content
                page={routePath}
                pagerouter={router}
                onPageChanged={pageChangeHandler}
                onVendorChanged={vendorChangedHandler}
                region={selectedRegion}
                routes={routeArray}
            />
            <Footer />

            {/* Session expiry warning modal */}
            {showSessionWarning && (
                <div style={{
                    position: "fixed", inset: 0,
                    background: "rgba(0,0,0,0.5)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    zIndex: 9999,
                }}>
                    <div style={{
                        background: "#fff", borderRadius: "8px",
                        padding: "32px", maxWidth: "400px", textAlign: "center",
                        boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
                    }}>
                        <h3 style={{ marginTop: 0 }}>Session Expiring Soon</h3>
                        <p>Your session will expire in 5 minutes due to inactivity.</p>
                        <button
                            onClick={handleStayLoggedIn}
                            style={{
                                marginRight: "12px", padding: "8px 20px",
                                background: "#0066cc", color: "#fff",
                                border: "none", borderRadius: "4px", cursor: "pointer",
                            }}
                        >
                            Stay Logged In
                        </button>
                        <button
                            onClick={redirectToLogin}
                            style={{
                                padding: "8px 20px",
                                background: "#f5f5f5", color: "#333",
                                border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer",
                            }}
                        >
                            Log Out Now
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
});
