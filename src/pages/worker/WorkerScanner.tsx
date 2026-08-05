import { useEffect, useState, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import axios from "axios";
import { api } from "../../api/axios";

// --- TYPES & INTERFACES ---
interface ScanResponse {
    access_granted: boolean;
    message: string;
    user_id: number;
    action_type: string;
}

export default function WorkerScanner() {
    // --- STATE MANAGEMENT ---
    const [scanMode, setScanMode] = useState<"ENTRY" | "EXIT">("ENTRY");
    const [locationId, setLocationId] = useState<number>(3);
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
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Update refs whenever state changes
    useEffect(() => {
        scanModeRef.current = scanMode;
    }, [scanMode]);

    useEffect(() => {
        locationIdRef.current = locationId;
    }, [locationId]);

    // --- INITIALIZE AUDIO ---
    useEffect(() => {
        // Preload the beep sound from the public folder
        audioRef.current = new Audio("/beep.mp3");
    }, []);

    // --- INITIALIZE CAMERA SCANNER ---
    useEffect(() => {
        // Prevent multiple instances in React StrictMode
        if (!scannerRef.current) {
            scannerRef.current = new Html5Qrcode("reader");
        }

        // Define the success handler inside the effect to capture the correct scope
        const handleScanSuccess = async (decodedText: string) => {
            // 1. Instantly pause scanning to prevent rapid-fire API calls
            setIsScanning(false);

            // 2. Play success beep sound
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(console.error);
            }

            // 3. Send API Request to backend using the LATEST values from refs
            try {
                const response = await api.post<ScanResponse>("/access/scan", {
                    qr_token: decodedText,
                    location_id: locationIdRef.current, // Use Ref!
                    scan_type: scanModeRef.current      // Use Ref!
                });

                // 4. Update UI to Green Success Screen
                setScanResult({
                    status: "SUCCESS",
                    message: response.data.message || "Access Granted"
                });

            } catch (err: unknown) {
                // 5. Update UI to Red Error Screen
                if (axios.isAxiosError(err)) {
                    setScanResult({
                        status: "ERROR",
                        message: err.response?.data?.detail || "Access Denied"
                    });
                } else {
                    setScanResult({
                        status: "ERROR",
                        message: "Unknown error occurred"
                    });
                }
            }

            // 6. Automatically resume scanning after 3 seconds
            setTimeout(() => {
                setScanResult({ status: "IDLE", message: "" });
                setIsScanning(true);
            }, 3000);
        };

        const startScanning = async () => {
            try {
                if (scannerRef.current && isScanning) {
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

        if (isScanning) {
            void startScanning();
        }

        // Cleanup function when component unmounts or scanning pauses
        return () => {
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().catch(console.error);
            }
        };
        // CRITICAL: We strictly rely ONLY on isScanning.
        // Changing scanMode no longer restarts the camera!
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                        <label className="block text-xs font-bold text-gray-500 mb-1">Scan Mode</label>
                        <select
                            value={scanMode}
                            onChange={(e) => setScanMode(e.target.value as "ENTRY" | "EXIT")}
                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 p-3 rounded-xl font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer"
                        >
                            <option value="ENTRY">Check In (Entry)</option>
                            <option value="EXIT">Check Out (Exit)</option>
                        </select>
                    </div>

                    <div className="w-full sm:w-1/3">
                        <label className="block text-xs font-bold text-gray-500 mb-1">Location ID</label>
                        <input
                            type="number"
                            value={locationId}
                            onChange={(e) => setLocationId(parseInt(e.target.value) || 1)}
                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 p-3 rounded-xl font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-center transition-all"
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