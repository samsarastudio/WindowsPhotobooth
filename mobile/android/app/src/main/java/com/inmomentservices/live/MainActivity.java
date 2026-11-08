package com.inmomentservices.live;

import android.app.*;
import android.os.*;
import android.content.*;
import android.graphics.*;
import android.net.Uri;
import android.provider.MediaStore;
import android.view.*;
import android.widget.*;
import androidx.core.content.FileProvider;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Native guest camera/gallery. Owner administration intentionally opens the web studio. */
public class MainActivity extends Activity {
    private static final String BASE = "https://live.inmomentservices.com";
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private LinearLayout content;
    private String slug = "";
    private String guestToken = "";
    private Uri captureUri;
    private boolean uploading;
    private final ArrayList<CountDownTimer> countdowns = new ArrayList<>();
    private boolean wasWaiting;
    private final Runnable poll = new Runnable() { public void run() { if (!slug.isEmpty() && !guestToken.isEmpty() && !uploading) loadEvent(); handler.postDelayed(this, 15000); } };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (state != null && state.getString("capture") != null) captureUri = Uri.parse(state.getString("capture"));
        String last = getPreferences(MODE_PRIVATE).getString("last-event", "");
        if (getIntent().getData() != null) openLink(getIntent().getData());
        else if (!last.isEmpty()) openLink(Uri.parse(BASE + "/e/" + last)); else home();
    }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); if (intent.getData() != null) openLink(intent.getData()); }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); if (captureUri != null) out.putString("capture", captureUri.toString()); }
    @Override protected void onResume() { super.onResume(); handler.postDelayed(poll, 15000); }
    @Override protected void onPause() { super.onPause(); handler.removeCallbacks(poll); for(CountDownTimer timer:countdowns)timer.cancel(); countdowns.clear(); }
    @Override protected void onDestroy() { handler.removeCallbacks(poll); network.shutdown(); super.onDestroy(); }
    private int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }
    private void layout() {
        for(CountDownTimer timer:countdowns)timer.cancel(); countdowns.clear();
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setBackgroundColor(Color.rgb(247,245,239));
        content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(dp(24),dp(36),dp(24),dp(36)); scroll.addView(content); setContentView(scroll);
        scroll.setOnApplyWindowInsetsListener((v, insets) -> { v.setPadding(0,insets.getSystemWindowInsetTop(),0,insets.getSystemWindowInsetBottom()); return insets; });
        label("inmoment  /  LIVE", 18);
    }
    private void label(String value, int size) { TextView v = new TextView(this); v.setText(value); v.setTextSize(size); v.setTextColor(Color.rgb(23,62,53)); v.setPadding(0,dp(12),0,dp(12)); content.addView(v); }
    private EditText input(String hint) { EditText v = new EditText(this); v.setHint(hint); v.setSingleLine(); content.addView(v); return v; }
    private void button(String title, Runnable action) { Button v = new Button(this); v.setText(title); v.setAllCaps(false); content.addView(v); v.setOnClickListener(w -> action.run()); }
    private void error(Exception e) { runOnUiThread(() -> { if (!isFinishing()) new AlertDialog.Builder(this).setTitle("Moments Live").setMessage(e.getMessage()).setPositiveButton("OK", null).show(); }); }
    private void home() {
        slug = ""; guestToken = ""; layout(); label("Every perspective, together.",34); label("Open your host’s event link or paste it below. No owner account is needed to join.",16);
        EditText url = input("https://live.inmomentservices.com/e/…"); button("Open event", () -> openLink(Uri.parse(url.getText().toString().trim())));
        button("Event owner studio", () -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(BASE))));
    }
    private void openLink(Uri uri) {
        java.util.List<String> segments = uri.getPathSegments();
        if (!"https".equals(uri.getScheme()) || !"live.inmomentservices.com".equals(uri.getHost()) || segments.size()!=2 || !"e".equals(segments.get(0)) || !segments.get(1).matches("[a-z0-9-]+")) { error(new Exception("Use a valid Moments Live event link.")); if (content == null) home(); return; }
        slug = segments.get(1); guestToken = getPreferences(MODE_PRIVATE).getString("guest-" + slug, ""); getPreferences(MODE_PRIVATE).edit().putString("last-event",slug).apply(); layout(); label("Opening your event…",24); loadEvent();
    }
    private byte[] request(String method, String endpoint, byte[] bytes, String type, String token) throws Exception {
        HttpURLConnection c = (HttpURLConnection)new URL(BASE + endpoint).openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(45000); c.setRequestMethod(method); c.setInstanceFollowRedirects(false);
        if (!token.isEmpty()) c.setRequestProperty("X-Guest-Token", token);
        try {
            if (bytes != null) { c.setDoOutput(true); c.setRequestProperty("Content-Type",type); c.setFixedLengthStreamingMode(bytes.length); try(OutputStream out=c.getOutputStream()){out.write(bytes);} }
            int status = c.getResponseCode(); InputStream stream = status >= 400 ? c.getErrorStream() : c.getInputStream();
            byte[] result = stream == null ? new byte[0] : read(stream, 20*1024*1024);
            if (status < 200 || status >= 300) { String message="Request failed ("+status+")"; try { message=new JSONObject(new String(result,StandardCharsets.UTF_8)).optString("error",message); } catch(Exception ignored) {} throw new IOException(message); }
            return result;
        } finally { c.disconnect(); }
    }
    private byte[] read(InputStream input, int limit) throws Exception { try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1){if(out.size()+n>limit)throw new IOException("Image is too large. Choose one under 15 MB.");out.write(buf,0,n);}return out.toByteArray();} }
    private JSONObject json(String method,String endpoint,JSONObject body,String token) throws Exception { return new JSONObject(new String(request(method,endpoint,body==null?null:body.toString().getBytes(StandardCharsets.UTF_8),"application/json",token),StandardCharsets.UTF_8)); }
    private void loadEvent() {
        if (isFinishing() || isDestroyed()) return;
        final String current=slug, auth=guestToken;
        if(current.isEmpty())return;
        network.execute(() -> { try {
            JSONObject state=json("GET","/api/guest/"+current,null,auth);
            JSONArray photos=state.optBoolean("joined")?new JSONArray(new String(request("GET","/api/guest/"+current+"/photos",null,null,auth),StandardCharsets.UTF_8)):new JSONArray();
            runOnUiThread(() -> { if(slug.equals(current)&&!uploading&&!isFinishing()) render(state,photos,current,auth); });
        } catch(Exception e){error(e);} });
    }
    private void render(JSONObject state,JSONArray photos,String current,String auth) {
        JSONObject e=state.optJSONObject("event"); if(e==null)return;
        JSONObject flags=state.optJSONObject("features");
        boolean uploads=state.optBoolean("uploads_enabled",true), downloads=flags==null||flags.optBoolean("downloads",true), revealExperience=flags==null||flags.optBoolean("revealExperience",true);
        layout(); label(e.optString("title"),34); label(e.optString("description"),16);
        if(!state.optBoolean("joined")&&"published".equals(e.optString("status"))&&uploads) {
            label("Your photos are shared with the event owner"+("all".equals(e.optString("visibility"))?" and event guests.":".")+" Only upload photos you have permission to share.",14);
            EditText name=input("Your display name"); button("Join this event",()-> { final String display=name.getText().toString(); network.execute(()-> {try {
                JSONObject joined=json("POST","/api/guest/"+current+"/join",new JSONObject().put("name",display),auth);
                String issued=joined.optString("guest_token",auth);getPreferences(MODE_PRIVATE).edit().putString("guest-"+current,issued).apply();
                runOnUiThread(()-> {if(slug.equals(current)){guestToken=issued;loadEvent();}});
            }catch(Exception ex){error(ex);} }); });
        } else if(state.optBoolean("joined")) {
            label(state.optInt("remaining")+" photos left",16);
            if("published".equals(e.optString("status"))&&state.optInt("remaining")>0&&uploads){button("Take a photo",this::camera);button("Choose a photo",()-> {Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);pick.setType("image/*");pick.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(pick,11);});}
        }
        if(!uploads&&"published".equals(e.optString("status")))label("Photo submissions are paused by the administrator.",16);
        if("host".equals(e.optString("visibility")))label("This is a private collection for your event host.",16);
        if(revealExperience&&"published".equals(e.optString("status"))&&e.optLong("closes_at")>0)countdown("Camera closes in",e.optLong("closes_at")-state.optLong("server_time",System.currentTimeMillis()));
        if(!state.optBoolean("revealed")&&!"host".equals(e.optString("visibility"))) {
            if(revealExperience)countdown("Your moments reveal in",e.optLong("reveal")-state.optLong("server_time",System.currentTimeMillis()));
            else label("Photos appear at the host's scheduled reveal time.",16);
        }
        if(wasWaiting&&state.optBoolean("revealed")&&revealExperience&&!"host".equals(e.optString("visibility")))label("The wait is over. Your moments are ready.",24);
        wasWaiting=!state.optBoolean("revealed");
        label("The gallery",26);
        if(photos.length()==0)label("Photos appear here when shared, approved and revealed.",16);
        for(int i=0;i<photos.length();i++) {
            JSONObject photo=photos.optJSONObject(i);String imagePath=photo.optString("url");
            ImageView image=new ImageView(this);image.setAdjustViewBounds(true);image.setContentDescription("Photo by "+photo.optString("guest_name"));content.addView(image,new LinearLayout.LayoutParams(-1,dp(300)));
            network.execute(()-> {try {byte[] bytes=request("GET",imagePath+"?thumb=1",null,null,auth);Bitmap bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length);runOnUiThread(()->image.setImageBitmap(bitmap));}catch(Exception ignored){}});
            if(downloads)button("Save / share photo",()-> sharePhoto(imagePath+"?download=1",auth));
        }
        button("Refresh gallery",this::loadEvent);button("Share event link",()-> {Intent share=new Intent(Intent.ACTION_SEND);share.setType("text/plain");share.putExtra(Intent.EXTRA_TEXT,BASE+"/e/"+current);startActivity(Intent.createChooser(share,"Share event"));});button("Open another event",this::home);
    }
    private void countdown(String title,long remaining) {
        if(remaining<=0)return;
        TextView display=new TextView(this); display.setTextSize(22); content.addView(display);
        CountDownTimer timer=new CountDownTimer(remaining,1000) {
            public void onTick(long ms){long seconds=(ms+999)/1000;display.setText(title+"\n"+String.format(Locale.getDefault(),"%dd %02d:%02d:%02d",seconds/86400,(seconds/3600)%24,(seconds/60)%60,seconds%60));}
            public void onFinish(){display.setText(title+"\n00:00:00");if(!uploading)loadEvent();}
        };countdowns.add(timer);timer.start();
    }
    private void camera() {
        try {File dir=new File(getCacheDir(),"captures");dir.mkdirs();File file=File.createTempFile("capture-",".jpg",dir);captureUri=FileProvider.getUriForFile(this,getPackageName()+".files",file);
            Intent camera=new Intent(MediaStore.ACTION_IMAGE_CAPTURE);camera.putExtra(MediaStore.EXTRA_OUTPUT,captureUri);camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivityForResult(camera,10);
        }catch(Exception e){error(new Exception("Camera unavailable. Choose a photo from your library instead."));}
    }
    @Override protected void onActivityResult(int request,int result,Intent data) {super.onActivityResult(request,result,data);if(result!=RESULT_OK)return;Uri uri=request==10?captureUri:data==null?null:data.getData();if(uri!=null&&(request==10||request==11))upload(uri);}
    private void upload(Uri uri) {
        final String current=slug,auth=guestToken,requestId=UUID.randomUUID().toString();uploading=true;layout();label("Sharing your moment…",28);
        network.execute(()-> {try {
            byte[] photo=read(getContentResolver().openInputStream(uri),15*1024*1024);String boundary="Moments"+UUID.randomUUID();ByteArrayOutputStream out=new ByteArrayOutputStream();
            out.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"request_id\"\r\n\r\n"+requestId+"\r\n--"+boundary+"\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"capture.jpg\"\r\nContent-Type: application/octet-stream\r\n\r\n").getBytes(StandardCharsets.UTF_8));out.write(photo);out.write(("\r\n--"+boundary+"--\r\n").getBytes(StandardCharsets.UTF_8));
            request("POST","/api/guest/"+current+"/photos",out.toByteArray(),"multipart/form-data; boundary="+boundary,auth);
            runOnUiThread(()->Toast.makeText(this,"Photo shared",Toast.LENGTH_SHORT).show());
        }catch(Exception e){error(e);}finally{runOnUiThread(()->{uploading=false;loadEvent();});} });
    }
    private void sharePhoto(String endpoint,String auth) {
        network.execute(()-> {try {byte[] bytes=request("GET",endpoint,null,null,auth);File dir=new File(getCacheDir(),"captures");dir.mkdirs();File file=File.createTempFile("moment-",".jpg",dir);try(FileOutputStream out=new FileOutputStream(file)){out.write(bytes);}Uri uri=FileProvider.getUriForFile(this,getPackageName()+".files",file);
            runOnUiThread(()->{Intent share=new Intent(Intent.ACTION_SEND);share.setType("image/jpeg");share.putExtra(Intent.EXTRA_STREAM,uri);share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(Intent.createChooser(share,"Save or share your moment"));});
        }catch(Exception e){error(e);} });
    }
}
