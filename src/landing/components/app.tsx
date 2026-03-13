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
const TOKEN_REFRESH_MS      = 19 * 60 * 1000;     // refresh IDCS token every 19 min
const RELAUNCH_AUTH_URL     = "/logout";          // force fresh login flow
// (IDCS token expires in 60 min;
//  refresh token expires in 8 hrs)
// ─────────────────────────────────────────────────────────────────────────────

export const App = registerCustomElement("app-root", (props: Props) => {
    const [selectedVendor, setSelectedVendor] = useState("XYZ");
    const [selectedRegion, setSelectedRegion] = useState<string>("us-phoenix-1");
    const [routePath, setRoutePath] = useState<string>('');

    props.appName  = "LVV Portal";
    props.userLogin = sessionStorage.getItem("X-Oracle-Vendor-Email") || "";

    const tokenRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const refreshInFlightRef = useRef(false);
    const redirectingRef     = useRef(false);

    const routerUpdated = (actionable: CoreRouter.ActionableState<CoreRouter.DetailedRouteConfig>): void => {
        setRoutePath(actionable.state?.path);
    };

    const vendorChangedHandler = (vendor: string) => setSelectedVendor(vendor);
    const regionChangedHandler = (region: string) => setSelectedRegion(region);

    const redirectToLogin = () => {
        if (redirectingRef.current) return;
        redirectingRef.current = true;
        stopTokenRefresh();
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

    useEffect(() => {
        Context.getPageContext().getBusyContext().applicationBootstrapComplete();
        setSelectedVendor(sessionStorage.getItem("X-Oracle-Vendor") || "");
        router.currentState.subscribe(routerUpdated);
        router.sync();

        startTokenRefresh();

        return () => {
            stopTokenRefresh();
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
        </div>
    );
});
