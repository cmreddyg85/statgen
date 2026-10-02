package com.statgen.app;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;
import android.widget.Toast;

import java.io.OutputStream;

/** Full-screen WebView over the StatGen web app, plus the native bits a WebView lacks: file picking and downloads. */
public class MainActivity extends Activity {

    private static final int FILE_CHOOSER = 1;

    private WebView web;
    private ValueCallback<Uri[]> pendingUpload;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        // WebView ignores its own padding, so the system-bar insets go on a wrapper.
        android.widget.FrameLayout root = new android.widget.FrameLayout(this);
        root.addView(web);
        setContentView(root);

        // Dark status/nav bar icons over the app's light background.
        if (Build.VERSION.SDK_INT >= 30) {
            int light = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            getWindow().getInsetsController().setSystemBarsAppearance(light, light);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        // targetSdk 35+ draws edge to edge; keep the page clear of the status bar, nav bar and keyboard.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                v.setPadding(i.left, i.top, i.right, i.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);

        web.addJavascriptInterface(this, "StatGenAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (url.getHost() != null && url.getHost().equals(Uri.parse(BuildConfig.STATGEN_URL).getHost())) {
                    return false;
                }
                startActivity(new Intent(Intent.ACTION_VIEW, url));
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame()) return;
                view.loadDataWithBaseURL(null,
                        "<body style='font-family:sans-serif;text-align:center;padding-top:40vh'>"
                                + "<p>Cannot reach StatGen at " + BuildConfig.STATGEN_URL + "</p>"
                                + "<button onclick=\"location.href='" + BuildConfig.STATGEN_URL + "'\">Retry</button></body>",
                        "text/html", "utf-8", null);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingUpload != null) pendingUpload.onReceiveValue(null);
                pendingUpload = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER);
                } catch (Exception e) {
                    pendingUpload = null;
                    return false;
                }
                return true;
            }
        });

        // Plain links (<a href download>). Fetch inside the page so the session cookie goes along,
        // then hand the bytes to save(). Blob downloads call save() directly from the web app.
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
            web.evaluateJavascript("fetch(" + quote(url) + ",{credentials:'include'}).then(r=>r.blob()).then(b=>{"
                    + "const f=new FileReader();f.onload=()=>StatGenAndroid.save(" + quote(name) + ",f.result);f.readAsDataURL(b);})", null);
        });

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        }

        web.loadUrl(BuildConfig.STATGEN_URL);
    }

    // ponytail: whole file goes over the JS bridge as base64; fine for PDFs of a few MB.
    @JavascriptInterface
    public void save(String name, String dataUrl) {
        int comma = dataUrl.indexOf(',');
        String mime = dataUrl.substring(5, dataUrl.indexOf(';'));
        byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);

        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, name);
        values.put(MediaStore.Downloads.MIME_TYPE, mime);
        String message;
        try {
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                out.write(bytes);
            }
            message = "Saved to Downloads: " + name;
        } catch (Exception e) {
            message = "Download failed: " + e.getMessage();
        }
        String toast = message;
        runOnUiThread(() -> Toast.makeText(this, toast, Toast.LENGTH_LONG).show());
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER && pendingUpload != null) {
            pendingUpload.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            pendingUpload = null;
        }
    }

    @Override
    public void onBackPressed() {
        goBack();
    }

    private void goBack() {
        if (web.canGoBack()) web.goBack();
        else finish();
    }

    private static String quote(String s) {
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'";
    }
}
