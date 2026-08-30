import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { api } from "../../api/axios";
import { errorDetail } from "../../utils/errors";
import { playBeep, vibrate } from "../../utils/workout";
import NumberField from "../../components/NumberField";

// --- TYPES & INTERFACES ---
interface ScanResponse {
    access_granted: boolean;
    message: string;
    user_id: number;
    action_type: string;
}

export default function WorkerScanner() {
    // --- KIOSK MODE: locked ENTRY/EXIT + location via URL (?mode=&loc=) ---
    const [searchParams] = useSearchParams();
    const kioskModeParam = searchParams.get("mode");
    const kioskLocParam = searchParams.get("loc");
    const isKioskMode = kioskModeParam !== null && kioskLocParam !== null;

    // --- STATE MANAGEMENT ---
    const [scanMode, setScanMode] = useState<"ENTRY" | "EXIT">(() =>
        kioskModeParam === "ENTRY" || kioskModeParam === "EXIT" ? kioskModeParam : "ENTRY"
    );
    const [locationId, setLocationId] = useState<number>(() => {
        const parsed = kioskLocParam ? parseInt(kioskLocParam, 10) : NaN;
        return !isNaN(parsed) ? parsed : 3;
    });
    const [isScanning, setIsScanning] = useState<boolean>(true);

    // UI State for scan result overlay (Green/Red screen)
    const [scanResult, setScanResult] = useState<{
        status: "SUCCESS" | "ERROR" | "IDLE";
        message: string;
    }>({ status: "IDLE", message: "" });

    // --- REFS FOR STABLE CAMERA OPERATION ---
    // We use refs to hold the latest UI state so the camera doesn't need to restart
    // every time the user switches from ENTRY to EXIT or changes the Location ID.
    const scanModeRef = useRef<"ENTRY" | "EXIT">(scanMode);
    const locationIdRef = useRef<number>(locationId);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    // Held so the unmount cleanup can wait for a camera that is still starting
    const startPromiseRef = useRef<Promise<void> | null>(null);

    // Update refs whenever state changes
    useEffect(() => {
        scanModeRef.current = scanMode;
    }, [scanMode]);

    useEffect(() => {
        locationIdRef.current = locationId;
    }, [locationId]);

    // --- INITIALIZE CAMERA SCANNER ---
    useEffect(() => {
        // Owns the camera for as long as the page is mounted. Deliberately NOT keyed
        // on isScanning: that flips on every single scan, so rebuilding the scanner
        // here would close and reopen the camera between codes.
        const scanner = new Html5Qrcode("reader");
        scannerRef.current = scanner;

        // The countdown that puts the scanner back into scanning mode after a result.
        // Scoped to this effect so the teardown below can cancel it - unmounting the
        // page mid-countdown otherwise left it to setState on a dead component.
        let resumeTimer: number | undefined;

        // Define the success handler inside the effect to capture the correct scope
        const handleScanSuccess = async (decodedText: string) => {
            // 1. Instantly pause scanning to prevent rapid-fire API calls
            setIsScanning(false);

            // 2. Send API Request to backend using the LATEST values from refs
            try {
                const response = await api.post<ScanResponse>("/access/scan", {
                    qr_token: decodedText,
                    location_id: locationIdRef.current, // Use Ref!
                    scan_type: scanModeRef.current      // Use Ref!
                });

                // 3. Update UI to Green Success Screen
                setScanResult({
                    status: "SUCCESS",
                    message: response.data.message || "Access Granted"
                });

                // The cue belongs HERE, not before the request. It used to fire the
                // moment a code was read, which meant the door sounded identical
                // whether it opened or refused - the one thing the worker needs the
                // sound to tell them. They are usually looking at the member, not the
                // phone.
                playBeep();

            } catch (err: unknown) {
                // 4. Update UI to Red Error Screen
                setScanResult({
                    status: "ERROR",
                    message: errorDetail(err, "Access Denied")
                });

                // Deliberately not a beep: a refusal must not sound like a success.
                // A double buzz is unmistakable in a noisy gym and needs no speaker.
                vibrate([80, 60, 80]);
            }

            // The post above is awaited, so the page may be gone by now. The effect
            // cleanup nulls scannerRef synchronously, and a StrictMode remount points it
            // at a different scanner - either way this handler no longer owns the camera.
            // Without this the timer below would be armed AFTER the cleanup already ran
            // clearTimeout on it, and fire three seconds later on a dead component.
            if (scannerRef.current !== scanner) return;

            // 5. Automatically resume scanning after 3 seconds
            clearTimeout(resumeTimer);
            resumeTimer = window.setTimeout(() => {
                setScanResult({ status: "IDLE", message: "" });
                setIsScanning(true);
            }, 3000);
        };

        const startScanning = async () => {
            try {
                if (scannerRef.current) {
                    await scannerRef.current.start(
                        { facingMode: "environment" }, // Prefer back camera on mobile
                        {
                            fps: 10, // Frames per second
                            qrbox: { width: 250, height: 250 }, // UI scanning box
                        },
                        handleScanSuccess,
                        () => { /* Silently ignore empty frames to prevent console spam */ }
                    );
                }
            } catch (err) {
                console.error("Camera initialization failed:", err);
            }
        };

        // Kept so the cleanup can wait for it. Calling stop() while start() is still
        // in flight is exactly what leaves the camera light on: isScanning is still
        // false at that moment, html5-qrcode throws "Cannot stop, scanner is not
        // running or paused.", the old .catch() swallowed it, and the video track was
        // never released.
        startPromiseRef.current = startScanning();

        // Cleanup function when component unmounts
        return () => {
            // Give up ownership synchronously, before anything is awaited. StrictMode
            // runs this cleanup and then the effect again, so the replacement scanner
            // must not be reachable from the teardown of the old one.
            scannerRef.current = null;
            clearTimeout(resumeTimer);
            const pendingStart = startPromiseRef.current;
            startPromiseRef.current = null;

            void (async () => {
                try {
                    await pendingStart;
                    if (scanner.isScanning) {
                        await scanner.stop();
                    }
                    // clear() empties the #reader element, so only tidy up when
                    // nobody has mounted a new scanner into it in the meantime.
                    if (scannerRef.current === null) {
                        scanner.clear();
                    }
                } catch (err) {
                    // html5-qrcode rejects with a plain string, not an Error.
                    console.error("Camera teardown failed:", err);
                }
            })();
        };
    }, []);

    // --- PAUSE BETWEEN SCANS INSTEAD OF STOPPING ---
    // CRITICAL: We strictly rely ONLY on isScanning.
    // Changing scanMode no longer restarts the camera!
    useEffect(() => {
        const scanner = scannerRef.current;
        if (!scanner) return;

        void (async () => {
            // On the very first run the camera may still be starting up.
            await startPromiseRef.current;
            if (scannerRef.current !== scanner) return;

            // pause(true) freezes the video but keeps the stream open, so the next
            // scan does not pay for the camera warming up all over again. Guarded on
            // the reported state because both calls throw if it is already there.
            const state = scanner.getState();
            if (isScanning && state === Html5QrcodeScannerState.PAUSED) {
                scanner.resume();
            } else if (!isScanning && state === Html5QrcodeScannerState.SCANNING) {
                scanner.pause(true);
            }
        })();
    }, [isScanning]);

    return (
        <div className="max-w-xl mx-auto flex flex-col gap-6 p-4 sm:p-0">

            {/* --- HEADER & CONTROLS --- */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-slate-800 transition-colors">
                <h1 className="text-2xl font-black text-gray-900 dark:text-white mb-4 text-center">
                    QR Turnstile Scanner
                </h1>

                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="w-full sm:flex-1">
                        <label htmlFor="scan-mode" className="block text-xs font-bold text-gray-500 mb-1">Scan Mode</label>
                        <select
                            id="scan-mode"
                            value={scanMode}
                            onChange={(e) => setScanMode(e.target.value as "ENTRY" | "EXIT")}
                            disabled={isKioskMode}
                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 p-3 rounded-xl font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <option value="ENTRY">Check In (Entry)</option>
                            <option value="EXIT">Check Out (Exit)</option>
                        </select>
                    </div>

                    <div className="w-full sm:w-1/3">
                        <label htmlFor="scan-location" className="block text-xs font-bold text-gray-500 mb-1">Location ID</label>
                        <NumberField
                            id="scan-location"
                            min={1}
                            step={1}
                            inputMode="numeric"
                            value={locationId}
                            onValueChange={setLocationId}
                            disabled={isKioskMode}
                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 p-3 rounded-xl font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-center transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                    </div>
                </div>
            </div>

            {/* --- CAMERA / RESULT OVERLAY --- */}
            <div className="relative bg-black rounded-3xl overflow-hidden shadow-2xl border-4 border-gray-800 h-[400px] w-full flex items-center justify-center">

                {/* Result Overlay (Green/Red) */}
                {scanResult.status !== "IDLE" && (
                    <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-300 ${
                        scanResult.status === "SUCCESS" ? "bg-emerald-500" : "bg-rose-600"
                    }`}>
                        <span className="text-6xl mb-4">
                            {scanResult.status === "SUCCESS" ? "✅" : "⛔"}
                        </span>
                        <h2 className="text-3xl font-black text-white mb-2 tracking-tight">
                            {scanResult.status === "SUCCESS" ? "GRANTED" : "DENIED"}
                        </h2>
                        <p className="text-white font-bold text-lg opacity-90">
                            {scanResult.message}
                        </p>
                    </div>
                )}

                {/* The actual HTML5 QrCode container */}
                <div id="reader" className="w-full h-full object-cover bg-gray-900 flex items-center justify-center"></div>

                {/* Overlay text when starting */}
                {isScanning && scanResult.status === "IDLE" && (
                    <div className="absolute top-4 left-0 right-0 text-center z-10 pointer-events-none">
                        <span className="bg-black/50 text-white px-4 py-2 rounded-full font-bold text-sm backdrop-blur-md">
                            Point camera at a member's QR code
                        </span>
                    </div>
                )}
            </div>

        </div>
    );
}