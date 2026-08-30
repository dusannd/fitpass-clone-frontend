import React, { useState, useMemo } from "react";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
} from "recharts";

// --- TYPES & INTERFACES ---
export interface ExerciseInfo {
    id: number;
    name: string;
}

export interface ExerciseLogItem {
    id: number;
    exercise_id?: number | null;
    weight_kg?: number | null;
    exercise?: ExerciseInfo | null;
}

export interface WorkoutSessionItem {
    id: number;
    date: string;
    exercise_logs: ExerciseLogItem[];
}

interface ProgressCardProps {
    sessions: WorkoutSessionItem[];
}

interface ChartPoint {
    date: string;
    weight: number;
}

// One exercise as offered by the dropdown: the key we group on, plus a pretty label.
interface ExerciseOption {
    key: string;
    label: string;
}

// --- NAME NORMALIZATION ---
// Exercise names are free text typed by trainers, so "Bench press", "Bench Press" and
// "Bench Press " all mean the same lift. We group on a normalized key and only pretty it
// up for display, so one lift is always one line on the chart instead of three.
// The \s+ collapse also catches accidental double spaces ("Bench  Press").
const normalizeName = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, " ");

const toDisplayName = (key: string): string =>
    key
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

export const ProgressCard: React.FC<ProgressCardProps> = ({ sessions }) => {
    // Holds a normalized key, not a raw name.
    const [selectedExercise, setSelectedExercise] = useState<string>("");

    // Extract ONLY exercises that have recorded weights strictly greater than 0 kg
    const availableExercises = useMemo<ExerciseOption[]>(() => {
        const keys = new Set<string>();
        sessions.forEach((session) => {
            session.exercise_logs.forEach((log) => {
                if (
                    log.exercise?.name &&
                    log.weight_kg !== null &&
                    log.weight_kg !== undefined &&
                    log.weight_kg > 0
                ) {
                    keys.add(normalizeName(log.exercise.name));
                }
            });
        });

        // The label comes from the key, not from whichever spelling happened to be logged
        // first, so the dropdown reads the same no matter what order the data arrives in.
        return Array.from(keys)
            .map((key) => ({ key, label: toDisplayName(key) }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [sessions]);

    // Active exercise defaults to the first available weighted exercise
    const currentExercise = selectedExercise || availableExercises[0]?.key || "";

    // Aggregate maximum weight lifted per date for the chosen exercise
    const chartData = useMemo<ChartPoint[]>(() => {
        if (!currentExercise) return [];

        const points: ChartPoint[] = [];

        // Sort sessions from oldest to newest for chronological progress
        const sortedSessions = [...sessions].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        sortedSessions.forEach((session) => {
            // Match on the normalized key, so every spelling variant of the same lift
            // feeds the same session point.
            const matchingLogs = session.exercise_logs.filter(
                (log) =>
                    log.exercise?.name != null &&
                    normalizeName(log.exercise.name) === currentExercise &&
                    log.weight_kg !== null &&
                    log.weight_kg !== undefined &&
                    log.weight_kg > 0
            );

            if (matchingLogs.length > 0) {
                // Find maximum weight lifted during this session
                const maxWeight = Math.max(...matchingLogs.map((l) => l.weight_kg || 0));

                const formattedDate = new Date(session.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                });

                points.push({
                    date: formattedDate,
                    weight: maxWeight,
                });
            }
        });

        return points;
    }, [sessions, currentExercise]);

    // Calculate maximum historical weight (Personal Record)
    const personalRecord = useMemo(() => {
        if (chartData.length === 0) return 0;
        return Math.max(...chartData.map((d) => d.weight));
    }, [chartData]);

    if (sessions.length === 0 || availableExercises.length === 0) {
        return (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-slate-400">
                <p className="font-medium text-sm">
                    Log a workout with weights (above 0 kg) to unlock your strength progress chart! 💪
                </p>
            </div>
        );
    }

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-xl flex flex-col gap-6">
            {/* HEADER: TITLE + SELECTOR */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                        <span>Strength Progress</span>
                        <span className="text-xs bg-blue-500/20 text-blue-400 font-semibold px-2.5 py-0.5 rounded-full border border-blue-500/30">
                            Analytics
                        </span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">Track your personal records over time</p>
                </div>

                {/* EXERCISE DROPDOWN SELECTOR */}
                <select
                    value={currentExercise}
                    onChange={(e) => setSelectedExercise(e.target.value)}
                    className="bg-slate-800 text-slate-200 border border-slate-700 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                    {availableExercises.map((option) => (
                        <option key={option.key} value={option.key}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* KEY METRIC STAT DISPLAY */}
            <div className="flex items-baseline gap-3 bg-slate-800/50 p-4 rounded-xl border border-slate-800">
                <div className="flex flex-col">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Personal Record (PR)
                    </span>
                    <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-3xl font-black text-blue-400">{personalRecord}</span>
                        <span className="text-sm font-bold text-slate-400">kg</span>
                    </div>
                </div>
            </div>

            {/* AREA CHART */}
            <div className="h-56 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis
                            dataKey="date"
                            stroke="#64748B"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            stroke="#64748B"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            domain={["dataMin - 5", "dataMax + 5"]}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "#0F172A",
                                borderColor: "#334155",
                                borderRadius: "0.75rem",
                                color: "#F8FAFC",
                                fontSize: "12px",
                                fontWeight: "bold",
                            }}
                            formatter={(value: unknown) => [`${value ?? 0} kg`, "Max Weight"]}
                        />
                        <Area
                            type="monotone"
                            dataKey="weight"
                            stroke="#3B82F6"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#weightGradient)"
                            dot={{ fill: "#3B82F6", r: 4, strokeWidth: 2, stroke: "#0F172A" }}
                            activeDot={{ r: 6, fill: "#60A5FA" }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};