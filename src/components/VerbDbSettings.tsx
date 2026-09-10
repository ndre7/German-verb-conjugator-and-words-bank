import React from "react";
import {
  Smartphone,
  FolderOpen,
  Chrome,
  Database,
  Trash2,
  Upload,
  Info,
  Download,
  Check,
  Loader2,
  CheckCircle,
  XCircle
} from "lucide-react";
import { Locale } from "../translations";

interface VerbDbSettingsProps {
  locale: Locale;
  isRtl: boolean;
  t: any;
  tauriPath: string;
  setTauriPath: (path: string) => void;
  handleSaveTauriPath: (e: React.FormEvent) => void;
  tauriSaveStatus: string;
  tauriSaveStep: number;
  deleteStatus: string;
  deleteStep: number;
  deleteError: string | null;
  setDeleteStatus: (status: any) => void;
  setDeleteStep: (step: number) => void;
  uploadStatus: string;
  uploadStep: number;
  uploadError: string | null;
  setUploadStatus: (status: any) => void;
  setUploadStep: (step: number) => void;
  uploadedFileName: string | null;
  setUploadedFileName: (name: string | null) => void;
  importedVerbsCount: number;
  reloadCountdown: number | null;
  persistedDbName: string | null;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (show: boolean) => void;
  handleJsonUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDeleteDatabase: () => void;
  handleDownloadTemplate: () => void;
}

export default function VerbDbSettings({
  locale,
  isRtl,
  t,
  tauriPath,
  setTauriPath,
  handleSaveTauriPath,
  tauriSaveStatus,
  tauriSaveStep,
  deleteStatus,
  deleteStep,
  deleteError,
  setDeleteStatus,
  setDeleteStep,
  uploadStatus,
  uploadStep,
  uploadError,
  setUploadStatus,
  setUploadStep,
  uploadedFileName,
  setUploadedFileName,
  importedVerbsCount,
  reloadCountdown,
  persistedDbName,
  showDeleteConfirm,
  setShowDeleteConfirm,
  handleJsonUpload,
  handleDeleteDatabase,
  handleDownloadTemplate,
}: VerbDbSettingsProps) {
  return (
    <div className="w-full">
      {/* Right configuration forms column */}
      <div className="space-y-6 w-full max-w-5xl mx-auto">
        {/* Tauri Settings Form */}
        <div className={`bg-white border border-slate-200 p-6 rounded-3xl shadow-xs space-y-4 ${isRtl ? "text-right" : "text-left"}`}>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Smartphone className="w-5 h-5 text-indigo-600" />
            <span className="font-vazir">{t.tauriConfigTitle}</span>
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed font-vazir">
            {t.tauriConfigDesc}
          </p>

          {tauriSaveStatus !== "idle" ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 font-vazir text-xs">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-800">
                  {locale === "fa" ? "مراحل ذخیره‌سازی مسیر" : "Path saving steps"}
                </span>
                {tauriSaveStatus === "success" ? (
                  <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md font-bold">
                    {locale === "fa" ? "ذخیره شد" : "Saved"}
                  </span>
                ) : tauriSaveStatus === "error" ? (
                  <span className="text-[10px] text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md font-bold">
                    {locale === "fa" ? "خطا" : "Error"}
                  </span>
                ) : (
                  <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {locale === "fa" ? "در حال ذخیره..." : "Saving..."}
                  </span>
                )}
              </div>

              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full transition-all duration-500 ease-out"
                  style={{ width: `${(tauriSaveStep / 3) * 100}%` }}
                />
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    tauriSaveStep > 1 ? "bg-emerald-500 text-white" : tauriSaveStep === 1 ? "bg-indigo-600 text-white animate-pulse" : "bg-slate-200 text-slate-500"
                  }`}>
                    {tauriSaveStep > 1 ? <Check className="w-3 h-3" /> : (locale === "fa" ? "۱" : "1")}
                  </div>
                  <span className={`${tauriSaveStep === 1 ? "text-indigo-600 font-bold" : "text-slate-500"}`}>
                    {locale === "fa" ? "اعتبارسنجی فرمت مسیر محلی..." : "Validating local path format..."}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    tauriSaveStep > 2 ? "bg-emerald-500 text-white" : tauriSaveStep === 2 ? "bg-indigo-600 text-white animate-pulse" : "bg-slate-200 text-slate-500"
                  }`}>
                    {tauriSaveStep > 2 ? <Check className="w-3 h-3" /> : (locale === "fa" ? "۲" : "2")}
                  </div>
                  <span className={`${tauriSaveStep === 2 ? "text-indigo-600 font-bold" : "text-slate-500"}`}>
                    {t.uploadingStatusSavingTauri}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    tauriSaveStep === 3 ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
                  }`}>
                    {tauriSaveStep === 3 ? <Check className="w-3 h-3" /> : (locale === "fa" ? "۳" : "3")}
                  </div>
                  <span className={`${tauriSaveStep === 3 ? "text-emerald-600 font-bold" : "text-slate-500"}`}>
                    {t.tauriPathSuccess}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveTauriPath} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1 font-vazir">
                  {t.tauriPathLabel}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={tauriPath}
                    onChange={(e) => setTauriPath(e.target.value)}
                    placeholder="C:\Users\Username\Documents\German_DB.json"
                    className={`w-full py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 font-mono text-xs ${
                      isRtl ? "pl-4 pr-10 text-right" : "pl-10 pr-4 text-left"
                    }`}
                  />
                  <FolderOpen className={`w-4 h-4 text-slate-400 absolute top-3.5 ${isRtl ? "right-3.5" : "left-3.5"}`} />
                </div>
              </div>
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-colors shadow-xs font-vazir cursor-pointer"
              >
                {t.saveTauriPathBtn}
              </button>
            </form>
          )}
        </div>

        {/* Chrome Extension Settings Form */}
        <div className={`bg-white border border-slate-200 p-6 rounded-3xl shadow-xs space-y-4 ${isRtl ? "text-right" : "text-left"}`}>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Chrome className="w-5 h-5 text-amber-500" />
            <span className="font-vazir">{t.chromeConfigTitle}</span>
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed font-vazir">
            {t.chromeConfigDesc}
          </p>

          {deleteStatus !== "idle" ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 font-vazir text-sm">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-800">
                  {locale === "fa" ? "مراحل حذف دیتابیس سفارشی" : "Database deletion steps"}
                </span>
                {deleteStatus === "success" ? (
                  <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg font-bold">
                    {locale === "fa" ? "کامل شد" : "Completed"}
                  </span>
                ) : deleteStatus === "error" ? (
                  <span className="text-xs text-rose-600 bg-rose-50 px-2 py-1 rounded-lg font-bold">
                    {locale === "fa" ? "ناموفق" : "Failed"}
                  </span>
                ) : (
                  <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg font-bold flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                    {locale === "fa" ? "در حال حذف..." : "Deleting..."}
                  </span>
                )}
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full transition-all duration-500 ease-out"
                  style={{ width: `${(deleteStep / 3) * 100}%` }}
                />
              </div>

              {/* Steps list */}
              <div className="space-y-3 pt-2">
                {/* Step 1 */}
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    deleteStep > 1 ? "bg-emerald-500 text-white" : deleteStep === 1 ? "bg-indigo-600 text-white animate-pulse" : "bg-slate-200 text-slate-500"
                  }`}>
                    {deleteStep > 1 ? <Check className="w-3.5 h-3.5" /> : (locale === "fa" ? "۱" : "1")}
                  </div>
                  <span className={`text-xs font-medium ${deleteStep === 1 ? "text-indigo-600 font-bold" : "text-slate-500"}`}>
                    {locale === "fa" ? "در حال پاکسازی داده‌های دیتابیس آپلود شده..." : "Clearing custom database records..."}
                  </span>
                </div>

                {/* Step 2 */}
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    deleteStep > 2 ? "bg-emerald-500 text-white" : deleteStep === 2 ? "bg-indigo-600 text-white animate-pulse" : "bg-slate-200 text-slate-500"
                  }`}>
                    {deleteStep > 2 ? <Check className="w-3.5 h-3.5" /> : (locale === "fa" ? "۲" : "2")}
                  </div>
                  <span className={`text-xs font-medium ${deleteStep === 2 ? "text-indigo-600 font-bold" : "text-slate-500"}`}>
                    {locale === "fa" ? "بارگذاری مجدد و جایگزینی با دیتابیس نمونه پیش‌فرض..." : "Restoring and loading default sample database..."}
                  </span>
                </div>

                {/* Step 3 */}
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    deleteStep === 3 ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
                  }`}>
                    {deleteStep === 3 ? <Check className="w-3.5 h-3.5" /> : (locale === "fa" ? "۳" : "3")}
                  </div>
                  <span className={`text-xs font-medium ${deleteStep === 3 ? "text-indigo-600 font-bold" : "text-slate-500"}`}>
                    {locale === "fa" ? "آماده‌سازی نهایی و راه‌اندازی مجدد برنامه..." : "Finalizing reset and re-initializing..."}
                  </span>
                </div>
              </div>

              {/* Status Banner */}
              {deleteStatus === "success" && (
                <div className={`p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 ${isRtl ? "text-right" : "text-left"}`}>
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <div>
                    <p className="font-semibold">
                      {locale === "fa" ? "دیتابیس نمونه با موفقیت بازیابی شد!" : "Default sample database restored successfully!"}
                    </p>
                    {reloadCountdown !== null && (
                      <p className="text-[10px] text-emerald-600 font-bold mt-0.5 animate-pulse">
                        {locale === "fa" ? `بارگذاری مجدد خودکار برنامه در ${reloadCountdown} ثانیه...` : `Auto-reloading application in ${reloadCountdown}s...`}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {deleteStatus === "error" && (
                <div className={`p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2 ${isRtl ? "text-right" : "text-left"}`}>
                  <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <div>
                    <p className="font-semibold">{deleteError || (locale === "fa" ? "حذف دیتابیس با خطا مواجه شد" : "Deletion failed")}</p>
                    <button
                      onClick={() => {
                        setDeleteStatus("idle");
                        setDeleteStep(0);
                      }}
                      className="mt-1.5 text-[10px] bg-rose-600 hover:bg-rose-700 text-white font-bold px-2 py-1 rounded transition-colors cursor-pointer"
                    >
                      {locale === "fa" ? "تلاش مجدد" : "Try Again"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : uploadStatus !== "idle" ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 font-vazir text-sm">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-800">
                  {locale === "fa" ? "مراحل بارگذاری دیتابیس" : "Database loading steps"}
                </span>
                {uploadStatus === "success" ? (
                  <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg font-bold">
                    {locale === "fa" ? "کامل شد" : "Completed"}
                  </span>
                ) : uploadStatus === "error" ? (
                  <span className="text-xs text-rose-600 bg-rose-50 px-2 py-1 rounded-lg font-bold">
                    {locale === "fa" ? "ناموفق" : "Failed"}
                  </span>
                ) : (
                  <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg font-bold flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {locale === "fa" ? "در حال پردازش..." : "Processing..."}
                  </span>
                )}
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full transition-all duration-500 ease-out"
                  style={{ width: `${(uploadStep / 4) * 100}%` }}
                />
              </div>

              {/* Steps list */}
              <div className="space-y-3 pt-2">
                {/* Step 1 */}
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    uploadStep > 1 ? "bg-emerald-500 text-white" : uploadStep === 1 ? "bg-indigo-600 text-white animate-pulse" : "bg-slate-200 text-slate-500"
                  }`}>
                    {uploadStep > 1 ? <Check className="w-3.5 h-3.5" /> : (locale === "fa" ? "۱" : "1")}
                  </div>
                  <span className={`text-xs font-medium ${uploadStep === 1 ? "text-indigo-600 font-bold" : "text-slate-500"}`}>
                    {t.uploadingStatusReading}
                  </span>
                </div>

                {/* Step 2 */}
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    uploadStep > 2 ? "bg-emerald-500 text-white" : uploadStep === 2 ? "bg-indigo-600 text-white animate-pulse" : "bg-slate-200 text-slate-500"
                  }`}>
                    {uploadStep > 2 ? <Check className="w-3.5 h-3.5" /> : (locale === "fa" ? "۲" : "2")}
                  </div>
                  <span className={`text-xs font-medium ${uploadStep === 2 ? "text-indigo-600 font-bold" : "text-slate-500"}`}>
                    {t.uploadingStatusParsing}
                  </span>
                </div>

                {/* Step 3 */}
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    uploadStep > 3 ? "bg-emerald-500 text-white" : uploadStep === 3 ? "bg-indigo-600 text-white animate-pulse" : "bg-slate-200 text-slate-500"
                  }`}>
                    {uploadStep > 3 ? <Check className="w-3.5 h-3.5" /> : (locale === "fa" ? "۳" : "3")}
                  </div>
                  <span className={`text-xs font-medium ${uploadStep === 3 ? "text-indigo-600 font-bold" : "text-slate-500"}`}>
                    {t.uploadingStatusSaving}
                  </span>
                </div>

                {/* Step 4 */}
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    uploadStep === 4 ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
                  }`}>
                    {uploadStep === 4 ? <Check className="w-3.5 h-3.5" /> : (locale === "fa" ? "۴" : "4")}
                  </div>
                  <span className={`text-xs font-medium ${uploadStep === 4 ? "text-emerald-600 font-bold" : "text-slate-500"}`}>
                    {locale === "fa" ? "درون‌ریزی نهایی و راه‌اندازی مجدد" : "Finalizing and re-initializing..."}
                  </span>
                </div>
              </div>

              {/* Status Banner */}
              {uploadStatus === "success" && (
                <div className={`p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 ${isRtl ? "text-right" : "text-left"}`}>
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <div>
                    <p className="font-semibold">{t.uploadingStatusSuccess.replace("{count}", importedVerbsCount.toString())}</p>
                    {reloadCountdown !== null && (
                      <p className="text-[10px] text-emerald-600 font-bold mt-0.5 animate-pulse">
                        {locale === "fa" ? `بارگذاری مجدد خودکار برنامه در ${reloadCountdown} ثانیه...` : `Auto-reloading application in ${reloadCountdown}s...`}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {uploadStatus === "error" && (
                <div className={`p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2 ${isRtl ? "text-right" : "text-left"}`}>
                  <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <div>
                    <p className="font-semibold">{uploadError || t.uploadingStatusError}</p>
                    <button
                      onClick={() => {
                        setUploadStatus("idle");
                        setUploadStep(0);
                        setUploadedFileName(null);
                      }}
                      className="mt-1.5 text-[10px] bg-rose-600 hover:bg-rose-700 text-white font-bold px-2 py-1 rounded transition-colors cursor-pointer"
                    >
                      {locale === "fa" ? "تلاش مجدد" : "Try Again"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Active custom database block with delete button */}
              {persistedDbName && (
                <div className={`p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-3 ${isRtl ? "text-right" : "text-left"}`}>
                  <div className="flex items-center gap-2.5">
                    <div className="bg-amber-50 text-amber-600 p-2 rounded-xl shrink-0">
                      <Database className="w-4 h-4 text-amber-500" />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-vazir">
                        {locale === "fa" ? "دیتابیس سفارشی فعال:" : "Active Custom Database:"}
                      </span>
                      <span className="text-xs font-bold text-slate-700 font-mono break-all">
                        {persistedDbName}
                      </span>
                    </div>
                  </div>
                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full sm:w-auto text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold px-4 py-2.5 rounded-xl border border-rose-200 hover:border-rose-300 transition-all inline-flex items-center gap-1.5 justify-center font-vazir cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {locale === "fa" ? "حذف دیتابیس و بازگشت به نمونه" : "Delete Database & Restore Sample"}
                    </button>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2.5 items-center w-full sm:w-auto bg-rose-50/80 p-2 rounded-xl border border-rose-200">
                      <span className="text-[11px] font-semibold text-rose-800 font-vazir">
                        {locale === "fa" ? "مطمئن هستید؟" : "Are you sure?"}
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="px-2.5 py-1.5 text-[10px] bg-white hover:bg-slate-50 text-slate-600 rounded-lg border border-slate-200 transition-all font-semibold font-vazir cursor-pointer"
                        >
                          {locale === "fa" ? "لغو" : "Cancel"}
                        </button>
                        <button
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            handleDeleteDatabase();
                          }}
                          className="px-2.5 py-1.5 text-[10px] bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-all font-semibold font-vazir cursor-pointer"
                        >
                          {locale === "fa" ? "بله، حذف کن" : "Yes, Delete"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl p-6 text-center cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-all relative">
                <input
                  type="file"
                  accept=".json,.zip"
                  onChange={handleJsonUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
                <span className="text-sm font-semibold text-slate-700 block font-vazir">
                  {uploadedFileName ? `${locale === "fa" ? "فایل برگزیده:" : "Selected file:"} ${uploadedFileName}` : t.uploadPlaceholder}
                </span>
                <span className="text-xs text-slate-400 block mt-1 font-vazir">
                  {locale === "fa" ? "فایل‌های json. یا فشرده zip. (بسیار سریع‌تر و سبک‌تر) پذیرفته می‌شوند." : "Valid .json or compressed .zip files (recommended for fast upload) are accepted."}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center bg-indigo-50/50 border border-indigo-100 p-4 rounded-2xl">
                <div className={`flex gap-2 text-xs text-indigo-900 leading-relaxed max-w-md ${isRtl ? "text-right" : "text-left"}`}>
                  <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span className="font-vazir">
                    {t.templateDesc}
                  </span>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="w-full sm:w-auto text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl transition-all inline-flex items-center gap-1.5 justify-center shadow-xs shrink-0 mt-2 sm:mt-0 font-vazir cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> {t.templateBtn}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
