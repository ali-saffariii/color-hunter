/*! Color Hunter — bilingual layer (English / Persian)
 *
 *  The English source string is the key. That keeps the app readable in the
 *  code, makes an untranslated string fall back to English instead of showing a
 *  raw identifier, and lets a test check both directions: every Persian entry
 *  must correspond to a string the app really uses, and every string the app
 *  uses must have a Persian entry.
 *
 *  Placeholders are {name} and are substituted at call time, never concatenated
 *  into a sentence, because word order differs between the two languages.
 *
 *  Translation notes:
 *   - Persian here is written for a working designer, not translated literally.
 *     Interface verbs are the ones Persian software actually uses.
 *   - Technical tokens stay in Latin script and keep LTR direction: HEX, RGB,
 *     Lab, LCh, CMYK, ΔE00, K, MB, and Pantone/RAL codes. Mixing them into
 *     Persian digits would make a colour code unreadable, so digits stay Latin
 *     in both languages.
 *   - "Capture Quality" is rendered as «کیفیت ثبت» and deliberately never as
 *     «دقت», which is reserved for validated accuracy «دقت تأییدشده».
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CHI18N = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LANGS = {
    en: { name: 'English', dir: 'ltr', speech: 'en-US' },
    fa: { name: 'فارسی', dir: 'rtl', speech: 'fa-IR' }
  };

  var fa = {
    /* ---- shell, modes, main controls ---- */
    'Measure': 'اندازه‌گیری',
    'Compare': 'مقایسه',
    'Hunt': 'شکار',
    'Sample': 'نمونه',
    'Read the light.': 'نور را بخوان.',
    'Name the color.': 'رنگ را نام ببر.',
    'Point the camera at anything and hold your finger on it. The longer you hold, the more frames are averaged and the more precise the reading.':
      'دوربین را روی هر سطحی بگیر و انگشتت را همان‌جا نگه دار. هرچه بیشتر نگه داری، فریم‌های بیشتری میانگین گرفته می‌شوند و خواندن دقیق‌تر می‌شود.',
    'Start camera': 'شروع دوربین',
    'Open a photo': 'باز کردن عکس',
    'Torch': 'چراغ',
    'Switch camera': 'تعویض دوربین',
    'Open photo': 'باز کردن عکس',
    'Scene light': 'نور صحنه',
    'Sample size': 'اندازه نمونه',
    'Share card': 'کارت اشتراک',
    'Details': 'جزئیات',
    'Capture quality: how good the sampling conditions are. Not a colour-accuracy figure.':
      'کیفیت ثبت: شرایط نمونه‌برداری چقدر مناسب است. این عدد، دقت رنگ نیست.',
    'READY': 'آماده',
    'No color yet': 'هنوز رنگی خوانده نشده',
    'The color under your finger appears here.': 'رنگ زیر انگشتت اینجا نمایش داده می‌شود.',
    'White ref': 'مرجع سفید',
    'Save color': 'ذخیره رنگ',
    'Save both': 'ذخیره هر دو',
    'New target': 'هدف تازه',
    'Capture chart': 'ثبت چارت',
    'Cancel': 'انصراف',
    'Ref active': 'مرجع فعال',

    /* ---- compare ---- */
    'Hold two colors, one after the other': 'دو رنگ را یکی پس از دیگری نگه دار',
    'The first fills A, the second fills B.': 'اولی در A می‌نشیند، دومی در B.',
    'Now hold the second color': 'حالا رنگ دوم را نگه دار',
    'Tap A or B to refill that side.': 'روی A یا B بزن تا همان طرف دوباره پر شود.',
    'Identical to the eye': 'برای چشم یکسان',
    'Practically the same': 'عملاً یکی',
    'Small but visible difference': 'تفاوت کم ولی دیدنی',
    'Clearly different': 'آشکارا متفاوت',
    'Two different colors': 'دو رنگ جدا',
    'A and B match in lightness and saturation.': 'A و B در روشنایی و اشباع یکسان‌اند.',
    'B is {changes} than A.': 'B نسبت به A {changes} است.',
    'lighter': 'روشن‌تر',
    'darker': 'تیره‌تر',
    'more saturated': 'پررنگ‌تر',
    'more muted': 'مات‌تر',
    'shifted toward {hue}': 'متمایل به {hue}',
    'yellow': 'زرد',
    'blue': 'آبی',
    'red': 'قرمز',
    'purple': 'بنفش',

    /* ---- hunt ---- */
    'Find this in the real world': 'این را در دنیای واقعی پیدا کن',
    'Searching…': 'در جست‌وجو…',
    'That\'s it. Hold!': 'خودش است. نگه دار!',
    'Hot': 'داغ',
    'Warmer': 'گرم‌تر',
    'Cold': 'سرد',
    'Freezing': 'یخ',
    'Found': 'پیدا شد',
    'Streak {streak}   Best {best}': 'پیاپی {streak}   رکورد {best}',
    'Delta E {de}': 'دلتا ای {de}',
    'Caught Pantone {name} at ΔE {de}': 'Pantone {name} با ΔE {de} شکار شد',
    'So close. Hold a little longer so the ring fills.': 'خیلی نزدیک بود. کمی بیشتر نگه دار تا حلقه پر شود.',
    'Find Pantone {name}': 'Pantone {name} را پیدا کن',
    'Found it': 'پیدایش کردی',

    /* ---- calibration ---- */
    'Camera calibration': 'کالیبراسیون دوربین',
    'Lay the chart flat inside the frame with patch 1 (dark brown) at the top left. Use even light with no glare or shadow on the chart.':
      'چارت را صاف داخل کادر بگذار، طوری که خانه ۱ (قهوه‌ای تیره) بالا سمت چپ باشد. نور یکنواخت باشد و روی چارت برق یا سایه نیفتد.',
    'Capture a 24-patch chart once and the app fits a correction for this camera. A ColorChecker is a manufactured reference with known values; a chart from your own printer is only as good as that printer, so the two are not treated as equal.':
      'یک‌بار چارت ۲۴ خانه را ثبت کن تا اپ یک تصحیح برای همین دوربین برازش کند. ColorChecker یک مرجع ساخته‌شده با مقادیر معلوم است؛ چارتی که خودت چاپ می‌کنی به اندازه چاپگرت دقیق است، پس این دو یکی حساب نمی‌شوند.',
    'Printed chart': 'چارت چاپی',
    'ColorChecker': 'ColorChecker',
    'Calibrate': 'کالیبره کن',
    'Print chart': 'چاپ چارت',
    'Delete profile': 'حذف پروفایل',
    'Validated accuracy': 'دقت تأییدشده',
    'A phone, even calibrated, is not a substitute for a spectrophotometer. Calibration corrects this camera under the light it was measured in; change the light and the error changes with it.':
      'گوشی، حتی کالیبره‌شده، جای اسپکتروفتومتر را نمی‌گیرد. کالیبراسیون این دوربین را زیر همان نوری که اندازه‌گیری شده تصحیح می‌کند؛ نور که عوض شود، خطا هم عوض می‌شود.',
    'A manufactured ColorChecker. Its patch values are known, so the measured error can be reported as a validated figure.':
      'یک ColorChecker کارخانه‌ای. مقدار خانه‌هایش معلوم است، پس خطای اندازه‌گیری‌شده را می‌شود عددی تأییدشده گزارش کرد.',
    'A chart printed on your own printer. Its colours differ from the reference by an unknown amount, so the result is recorded as an approximate correction and never as validated accuracy.':
      'چارتی که با چاپگر خودت چاپ شده. رنگ‌هایش به اندازه‌ای نامعلوم با مرجع فرق دارند، پس نتیجه به عنوان تصحیح تقریبی ثبت می‌شود، نه دقت تأییدشده.',
    'Not validated': 'تأیید نشده',
    'Validated': 'تأییدشده',
    'Approximate': 'تقریبی',
    'Unknown': 'نامعلوم',
    'Not validated — no calibration profile for this camera.': 'تأیید نشده — برای این دوربین پروفایل کالیبراسیونی وجود ندارد.',
    'Profile from an earlier version: no independent validation was recorded. Calibrate again to measure it.':
      'پروفایل مربوط به نسخه قدیمی‌تر است و اعتبارسنجی مستقلی برایش ثبت نشده. برای اندازه‌گیری آن دوباره کالیبره کن.',
    'Approximate correction. Validated at ΔE00 {mean} median {median} on held-out patches, but against a printed chart, whose own colours are only approximate. Treat as a guide, not a measurement.':
      'تصحیح تقریبی. روی خانه‌های کنارگذاشته‌شده ΔE00 {mean} و میانه {median} اندازه‌گیری شد، اما مرجع یک چارت چاپی بوده که رنگ‌های خودش هم تقریبی‌اند. این را راهنما بدان، نه اندازه‌گیری.',
    'Validated against held-out patches of a ColorChecker: mean ΔE00 {mean}, median {median}, 95th percentile {p95}. Measured on {date}, under that light only.':
      'روی خانه‌های کنارگذاشته‌شده یک ColorChecker تأیید شد: میانگین ΔE00 {mean}، میانه {median}، صدک ۹۵ برابر {p95}. اندازه‌گیری در تاریخ {date} و فقط زیر همان نور.',
    'held-out ΔE {mean}': 'ΔE کنارگذاشته {mean}',
    'Fit the chart inside the frame, then tap Capture chart.': 'چارت را داخل کادر جا بده، بعد «ثبت چارت» را بزن.',
    'Measuring… keep the phone still.': 'در حال اندازه‌گیری… گوشی را ثابت نگه دار.',
    'Measuring… frame {n} of 8': 'در حال اندازه‌گیری… فریم {n} از ۸',
    'Part of the chart is clipped (glare or direct light). Tilt it slightly and capture again.':
      'بخشی از چارت سوخته است (برق نور یا نور مستقیم). کمی کجش کن و دوباره ثبت کن.',
    'The chart is not aligned or the light is uneven. Line the chart edges up with the frame and capture again.':
      'چارت تراز نیست یا نور یکنواخت نیست. لبه‌های چارت را با کادر تراز کن و دوباره ثبت کن.',
    'Calibrated. Fitting these patches brought the average error from ΔE00 {before} to {after}{heldout}{ref}':
      'کالیبره شد. برازش روی همین خانه‌ها میانگین خطا را از ΔE00 {before} به {after} رساند{heldout}{ref}',
    '. On patches left out of the fit the error is ΔE00 {mean} on average, {p95} at the 95th percentile — that is the honest figure.':
      '. روی خانه‌هایی که در برازش شرکت نداشتند، خطا به‌طور میانگین ΔE00 {mean} و در صدک ۹۵ برابر {p95} است — عدد صادقانه همین است.',
    ' Recorded against a ColorChecker.': ' با مرجع ColorChecker ثبت شد.',
    ' Recorded against a printed chart, so it is an approximate correction, not a validated measurement.':
      ' با یک چارت چاپی ثبت شد، پس تصحیحی تقریبی است، نه اندازه‌گیری تأییدشده.',
    'Profile for this camera deleted.': 'پروفایل این دوربین حذف شد.',
    'Start the camera or open a photo of the chart first.': 'اول دوربین را روشن کن یا عکس چارت را باز کن.',

    /* ---- scene light ---- */
    'Direct sun': 'آفتاب مستقیم',
    'Open shade': 'سایه روشن',
    'Overcast': 'هوای ابری',
    'Golden hour': 'ساعت طلایی',
    'Warm bulb': 'لامپ گرم',
    'White LED': 'ال‌ای‌دی سفید',
    'Mixed light': 'نور ترکیبی',
    'Likely {light}': 'احتمالاً {light}',
    'No image analysed yet.': 'هنوز تصویری تحلیل نشده.',
    'Two light sources with different colors seem to be in the scene (a window and a lamp, for example). Surfaces lit by both shift in color; keep a single light source if you can.':
      'به نظر می‌رسد دو منبع نور با رنگ‌های متفاوت در صحنه هست (مثلاً پنجره و لامپ). سطحی که هر دو نور رویش می‌افتد، رنگش جابه‌جا می‌شود؛ اگر می‌توانی فقط یک منبع نور نگه دار.',
    'Exposure': 'نوردهی',
    'unknown': 'نامعلوم',
    'Not recorded': 'ثبت نشده',
    'Confidence {pct}%. Based on: {why}.{profile}': 'اطمینان {pct}٪. بر پایه: {why}.{profile}',
    ' This camera\'s calibration profile is applied.': ' پروفایل کالیبراسیون این دوربین اعمال شده است.',
    'Measurement confidence {pct}%. Saved reading{light}.': 'اطمینان اندازه‌گیری {pct}٪. خوانش ذخیره‌شده{light}.',
    ' under {light}': ' زیر {light}',
    'color temperature reported by the camera sensor': 'دمای رنگ گزارش‌شده توسط حسگر دوربین',
    'color temperature measured from the image with white balance locked to daylight':
      'دمای رنگ اندازه‌گیری‌شده از تصویر، با تعادل سفیدی قفل‌شده روی نور روز',
    'color temperature estimated from the image (less reliable, since the camera already balanced it)':
      'دمای رنگ تخمین‌زده‌شده از تصویر (کم‌اعتمادتر، چون دوربین پیش‌تر خودش تعادل را اعمال کرده)',
    'exposure from the sensor (assuming f/1.8)': 'نوردهی از حسگر (با فرض f/1.8)',
    'exposure from the photo EXIF': 'نوردهی از EXIF عکس',
    'shadow contrast in the scene': 'کنتراست سایه‌ها در صحنه',
    'light source tag in EXIF': 'برچسب منبع نور در EXIF',

    /* ---- capture quality ---- */
    'Capture quality': 'کیفیت ثبت',
    'How good the sampling conditions are right now — light, steadiness, clipping, how even the patch is. It is not a colour-accuracy figure, and a high number does not mean the colour is correct.':
      'شرایط نمونه‌برداری در همین لحظه چقدر خوب است — نور، ثبات، سوختگی، و یکنواختی ناحیه. این عدد دقت رنگ نیست، و بالا بودنش یعنی درست بودن رنگ نیست.',
    'Nothing is working against this reading: the patch is even, the light is sufficient and nothing is clipped.':
      'هیچ‌چیز علیه این خوانش نیست: ناحیه یکنواخت است، نور کافی است و جایی نسوخته.',
    'Capture quality as recorded when this colour was saved. The conditions at the time cannot be re-checked now.':
      'کیفیت ثبت، همان‌طور که هنگام ذخیره این رنگ ثبت شده. شرایط آن لحظه حالا دیگر قابل بررسی نیست.',
    'Clipped highlight': 'هایلایت سوخته',
    'Strong reflection detected. Move the camera slightly, or shade the surface.': 'بازتاب شدید تشخیص داده شد. دوربین را کمی جابه‌جا کن یا روی سطح سایه بینداز.',
    'Too dark': 'خیلی تاریک',
    'Not enough light on this surface to read a colour. Add light or move closer.': 'نور این سطح برای خواندن رنگ کافی نیست. نور اضافه کن یا نزدیک‌تر شو.',
    'Low light': 'نور کم',
    'More light would make the reading steadier.': 'نور بیشتر، خوانش را پایدارتر می‌کند.',
    'Uneven sample': 'نمونه ناهمگن',
    'The patch covers an edge or texture. Move onto a flat area, or use a smaller sample size.':
      'ناحیه نمونه روی لبه یا بافت افتاده. روی یک سطح یکدست ببر، یا اندازه نمونه را کوچک‌تر کن.',
    'Two light sources of different colour are lighting the scene.': 'دو منبع نور با رنگ‌های متفاوت صحنه را روشن کرده‌اند.',
    'Few frames averaged': 'فریم کم',
    'Hold a little longer so more frames are averaged.': 'کمی بیشتر نگه دار تا فریم‌های بیشتری میانگین گرفته شوند.',
    'Outside sRGB': 'بیرون از sRGB',
    'The corrected colour falls outside what this screen can display.': 'رنگ تصحیح‌شده بیرون از محدوده‌ای است که این نمایشگر می‌تواند نشان دهد.',
    'No light correction': 'بدون تصحیح نور',
    'Raw mode reports what the camera saw, including the colour of the light.': 'حالت خام همان چیزی را گزارش می‌کند که دوربین دیده، از جمله رنگ خود نور.',
    '{issue}. {fix}': '{issue}. {fix}',

    /* ---- values, matches ---- */
    'Values': 'مقادیر',
    'HEX': 'HEX', 'RGB': 'RGB', 'Lab': 'Lab', 'LCh': 'LCh',
    'CMYK (estimate, no ICC profile)': 'CMYK (تخمینی، بدون پروفایل ICC)',
    'Raw camera': 'خام دوربین',
    'Tap any row to copy it. CMYK is a plain arithmetic estimate with no printer profile applied — never send it to print as-is.':
      'روی هر ردیف بزن تا کپی شود. CMYK یک تخمین حسابی ساده بدون پروفایل چاپگر است — همین‌طوری به چاپ نفرست.',
    'Nearest matches': 'نزدیک‌ترین تطبیق‌ها',
    'ΔE00 is a distance in a perceptual colour space. As a rough guide from the literature, around 1 is the smallest step most people notice on flat patches side by side and under 2.3 is usually a very close match — these are rules of thumb, not fixed limits of human vision. The Pantone and RAL values here are published sRGB approximations, not licensed colour data, so always confirm against a physical guide before ordering paint or print.':
      'ΔE00 فاصله‌ای در یک فضای رنگ ادراکی است. طبق قاعده‌ای سرانگشتی در منابع، حدود ۱ کوچک‌ترین پله‌ای است که بیشتر آدم‌ها روی دو سطح یکدست کنار هم تشخیص می‌دهند و زیر ۲٫۳ معمولاً تطبیق بسیار نزدیک است — این‌ها قاعده سرانگشتی‌اند، نه حد ثابت بینایی انسان. مقادیر Pantone و RAL اینجا تقریب‌های منتشرشده sRGB هستند، نه داده رنگ دارای مجوز، پس پیش از سفارش رنگ یا چاپ حتماً با راهنمای فیزیکی تطبیق بده.',
    'usually indistinguishable side by side': 'معمولاً کنار هم قابل تفکیک نیست',
    'very close (around the usual just-noticeable step)': 'بسیار نزدیک (حدود کوچک‌ترین پله محسوس)',
    'close, a difference most people can see': 'نزدیک، تفاوتی که بیشتر آدم‌ها می‌بینند',
    'clearly different — no near match in this list': 'آشکارا متفاوت — تطبیق نزدیکی در این فهرست نیست',

    /* ---- palette ---- */
    'Image palette': 'پالت تصویر',
    'Extract the 5 main colors': 'استخراج ۵ رنگ اصلی',
    'Tap a band to jump the reticle to that colour in the image. Shares are of the sampled pixels, not of the printed area.':
      'روی هر نوار بزن تا نشانگر روی همان رنگ در تصویر برود. سهم‌ها مربوط به پیکسل‌های نمونه‌برداری‌شده‌اند، نه مساحت چاپ‌شده.',
    'You need an image first.': 'اول باید تصویری داشته باشی.',

    /* ---- colour book ---- */
    'Color book': 'دفتر رنگ',
    'Colors you save collect here.': 'رنگ‌هایی که ذخیره می‌کنی اینجا جمع می‌شوند.',
    'Opening your saved colors…': 'در حال باز کردن رنگ‌های ذخیره‌شده…',
    '{n} colors': '{n} رنگ',
    'Export image': 'خروجی تصویر',
    'Print or PDF': 'چاپ یا PDF',
    'Back up to file': 'پشتیبان در فایل',
    'Restore from file': 'بازیابی از فایل',
    'Clear book': 'خالی کردن دفتر',
    'Tap again to clear every color': 'دوباره بزن تا همه رنگ‌ها پاک شوند',
    'Book cleared. A copy was kept inside the app in case you need it back.': 'دفتر خالی شد. یک نسخه داخل اپ نگه داشته شد تا اگر لازم شد برگردانی.',
    'The book could not be cleared.': 'دفتر خالی نشد.',
    'Saved. Tap it in the book to add a note.': 'ذخیره شد. در دفتر رویش بزن تا یادداشت اضافه کنی.',
    'Both saved to the book.': 'هر دو در دفتر ذخیره شدند.',
    'Only one of the two could be saved.': 'فقط یکی از آن دو ذخیره شد.',
    'Note saved.': 'یادداشت ذخیره شد.',
    'Deleted.': 'حذف شد.',
    'Save': 'ذخیره',
    'Copy codes': 'کپی کدها',
    'Delete': 'حذف',
    'Close': 'بستن',
    'Note: where was it, what is it? (sofa fabric, shop on Main St…)': 'یادداشت: کجا بود، چه بود؟ (پارچه مبل، مغازه سر خیابان…)',
    'Copied: {text}': 'کپی شد: {text}',
    'COLOR BOOK': 'دفتر رنگ',
    'Book image saved.': 'تصویر دفتر ذخیره شد.',
    'Card saved.': 'کارت ذخیره شد.',
    'Measure a color first.': 'اول یک رنگ اندازه بگیر.',
    'Measure both colors first.': 'اول هر دو رنگ را اندازه بگیر.',
    'Hold your finger on a color first.': 'اول انگشتت را روی یک رنگ نگه دار.',
    'That colour could not be saved: the reading was incomplete.': 'این رنگ ذخیره نشد: خوانش ناقص بود.',
    'That colour could not be deleted.': 'این رنگ حذف نشد.',
    'That change could not be saved.': 'این تغییر ذخیره نشد.',
    'Not saved: this device is out of storage. Back up to a file, then clear some colours.':
      'ذخیره نشد: فضای این دستگاه پر است. از داده‌ها فایل پشتیبان بگیر، بعد چند رنگ را پاک کن.',
    'Not saved: the browser refused to write to storage.': 'ذخیره نشد: مرورگر اجازه نوشتن در حافظه را نداد.',

    /* ---- backup / restore / storage ---- */
    '{n} colour on this device': '{n} رنگ روی این دستگاه',
    '{n} colours on this device': '{n} رنگ روی این دستگاه',
    'using {used} MB': 'مصرف {used} مگابایت',
    'using {used} MB of roughly {quota} MB this browser allows': 'مصرف {used} مگابایت از حدود {quota} مگابایتی که این مرورگر اجازه می‌دهد',
    '{n} colours and your settings written to a file.': '{n} رنگ به‌همراه تنظیماتت در یک فایل نوشته شد.',
    'That file is too large to be a Color Hunter backup.': 'این فایل بزرگ‌تر از آن است که پشتیبان Color Hunter باشد.',
    'That file could not be read.': 'این فایل خوانده نشد.',
    'Restore {n} colour?': 'بازیابی {n} رنگ؟',
    'Restore {n} colours?': 'بازیابی {n} رنگ؟',
    'Merge keeps everything you have now and adds what is new. Replace swaps your book for the file.':
      'ادغام هرچه الان داری را نگه می‌دارد و تازه‌ها را اضافه می‌کند. جایگزینی، دفترت را با محتوای فایل عوض می‌کند.',
    'Merge': 'ادغام',
    'Replace': 'جایگزینی',
    'Book replaced: {n} colours.': 'دفتر جایگزین شد: {n} رنگ.',
    '{added} added, {updated} updated, nothing lost.': '{added} تا اضافه شد، {updated} تا به‌روز شد، چیزی از دست نرفت.',
    'The restore did not finish. Your existing colours were not changed.': 'بازیابی کامل نشد. رنگ‌های فعلی‌ات دست‌نخورده ماندند.',
    '{n} saved colour moved into the new storage. The old copy was left untouched.':
      '{n} رنگ ذخیره‌شده به حافظه تازه منتقل شد. نسخه قدیمی دست‌نخورده ماند.',
    '{n} saved colours moved into the new storage. The old copy was left untouched.':
      '{n} رنگ ذخیره‌شده به حافظه تازه منتقل شد. نسخه قدیمی دست‌نخورده ماند.',
    'The old saved data could not be read. A copy has been kept; nothing was deleted.':
      'داده‌های قدیمی خوانده نشدند. یک نسخه از آن‌ها نگه داشته شد؛ چیزی حذف نشد.',
    'This browser cannot store colours (no IndexedDB). Private browsing is the usual cause.':
      'این مرورگر نمی‌تواند رنگ‌ها را ذخیره کند (IndexedDB ندارد). معمولاً دلیلش حالت ناشناس است.',
    'Colours cannot be saved in this browser mode. Everything else works.': 'در این حالت مرورگر، رنگ‌ها ذخیره نمی‌شوند. بقیه بخش‌ها کار می‌کنند.',
    'Saved colours could not be opened ({reason}). Nothing was deleted.': 'رنگ‌های ذخیره‌شده باز نشدند ({reason}). چیزی حذف نشد.',
    'Your saved colours could not be opened. Nothing has been deleted — close any other tab running this app, then reload.':
      'رنگ‌های ذخیره‌شده‌ات باز نشدند. چیزی حذف نشده — هر تب دیگری که این اپ را باز کرده ببند و صفحه را دوباره بارگذاری کن.',
    'unknown error': 'خطای نامشخص',
    'Settings could not be saved: browser storage is full.': 'تنظیمات ذخیره نشد: حافظه مرورگر پر است.',

    /* ---- light correction, toggles, settings ---- */
    'Light correction': 'تصحیح نور',
    'Raw': 'خام',
    'Auto': 'خودکار',
    'The color exactly as the camera saw it, no light correction.': 'دقیقاً همان رنگی که دوربین دیده، بدون هیچ تصحیح نوری.',
    'The cast of the scene light is estimated and removed automatically.': 'رنگ‌زدگی نور صحنه تخمین زده و به‌صورت خودکار برداشته می‌شود.',
    'Colors are corrected against the white you measured. The most accurate mode.': 'رنگ‌ها نسبت به سفیدی که اندازه گرفتی تصحیح می‌شوند. دقیق‌ترین حالت.',
    'Use this camera\'s profile': 'استفاده از پروفایل این دوربین',
    'Turn off to compare against the raw camera': 'خاموش کن تا با خروجی خام دوربین مقایسه کنی',
    'Capture': 'ثبت',
    'Auto-capture': 'ثبت خودکار',
    'Aim and keep steady: the reading locks by itself, then re-arms when you move on':
      'نشانه بگیر و ثابت نگه دار: خوانش خودش قفل می‌شود و وقتی جابه‌جا شوی دوباره آماده می‌شود',
    'Auto-capture on. Aim the center at a color and keep steady.': 'ثبت خودکار روشن شد. مرکز کادر را روی رنگ بگیر و ثابت نگه دار.',
    'Aim the center at a color and keep steady, or hold your finger on any spot.': 'مرکز کادر را روی رنگ بگیر و ثابت نگه دار، یا انگشتت را روی هر نقطه‌ای نگه دار.',
    'Hold your finger on a color until the ring fills.': 'انگشتت را روی رنگ نگه دار تا حلقه پر شود.',
    'Accessibility and sound': 'دسترس‌پذیری و صدا',
    'Speak colors aloud': 'خواندن رنگ‌ها با صدا',
    'Reads the name and code after every measurement': 'بعد از هر اندازه‌گیری نام و کد را می‌خواند',
    'Clicks and haptics': 'صدای کلیک و لرزش',
    'Voice on': 'صدا روشن شد',
    'Language': 'زبان',
    'Installed. Works offline too.': 'نصب شده. آفلاین هم کار می‌کند.',
    'To install, use "Add to Home Screen" in your browser.': 'برای نصب، از گزینه «افزودن به صفحه اصلی» در مرورگرت استفاده کن.',

    /* ---- white reference ---- */
    'Put a sheet of white paper in view and hold your finger on it.': 'یک برگ کاغذ سفید جلوی دوربین بگیر و انگشتت را رویش نگه دار.',
    'Hold on the white paper…': 'روی کاغذ سفید نگه دار…',
    'The paper is clipped. Move it out of direct light and try again.': 'کاغذ سوخته است. از نور مستقیم بیرونش بیاور و دوباره امتحان کن.',
    'The paper is too dark. More light needed.': 'کاغذ خیلی تاریک است. نور بیشتری لازم است.',
    'Not an even surface. Hold on the middle of the paper.': 'سطح یکدست نیست. وسط کاغذ را نگه دار.',
    'That surface is not white or grey.': 'این سطح سفید یا خاکستری نیست.',
    'White reference set. Now hold on any color.': 'مرجع سفید تنظیم شد. حالا روی هر رنگی نگه دار.',
    'Start the camera or open a photo first.': 'اول دوربین را روشن کن یا یک عکس باز کن.',
    'The light changed. Take the white reference again.': 'نور عوض شد. مرجع سفید را دوباره بگیر.',

    /* ---- camera errors ---- */
    'Camera permission was denied. Allow camera access for this site in your browser settings.':
      'اجازه دوربین داده نشد. در تنظیمات مرورگر، دسترسی دوربین را برای این سایت فعال کن.',
    'No camera found.': 'دوربینی پیدا نشد.',
    'Another app is using the camera. Close it and try again.': 'برنامه دیگری از دوربین استفاده می‌کند. ببندش و دوباره امتحان کن.',
    'The camera could not start. Open this page in Chrome or Safari.': 'دوربین شروع نشد. این صفحه را در Chrome یا Safari باز کن.',
    'Browsers only allow the camera on a secure (https) address or localhost. Host the file on https; until then, Open a photo works.':
      'مرورگرها دوربین را فقط روی آدرس امن (https) یا localhost اجازه می‌دهند. فایل را روی https میزبانی کن؛ تا آن موقع «باز کردن عکس» کار می‌کند.',
    'This browser has no camera access. If this opened inside an in-app browser, open it in Chrome or Safari.':
      'این مرورگر دسترسی دوربین ندارد. اگر صفحه داخل مرورگر یک اپ دیگر باز شده، آن را در Chrome یا Safari باز کن.',
    'This camera\'s torch cannot be controlled.': 'چراغ این دوربین قابل کنترل نیست.',
    'That file could not be opened. Pick a JPG or PNG.': 'این فایل باز نشد. یک JPG یا PNG انتخاب کن.',
    'For best accuracy, calibrate this camera once from Details.': 'برای بهترین دقت، یک‌بار این دوربین را از بخش جزئیات کالیبره کن.',

    /* ---- status strip ---- */
    'Photo': 'عکس', 'Hold': 'نگه‌داشتن', 'Live': 'زنده',
    'WB': 'WB', 'auto': 'خودکار', '5500K lock': 'قفل ۵۵۰۰K',
    'Profile': 'پروفایل', 'Ref': 'مرجع', 'No.': 'شماره',
    'Locked. Swipe for other matches.': 'قفل شد. برای تطبیق‌های دیگر انگشت بکش.',
    'Live reading.': 'خوانش زنده.',
    'Hold… {n} of {total} frames': 'نگه دار… {n} از {total} فریم',

    /* ---- about, tour ---- */
    'About': 'درباره',
    'How it works': 'چطور کار می‌کند',
    'Everything runs on your device. Images never leave your phone, nothing is uploaded, and your color book is stored only in this browser.':
      'همه‌چیز روی دستگاه خودت اجرا می‌شود. تصویرها هرگز از گوشی بیرون نمی‌روند، چیزی آپلود نمی‌شود و دفتر رنگت فقط در همین مرورگر ذخیره است.',
    'PANTONE® is a registered trademark of Pantone LLC, and RAL is a trademark of RAL gGmbH. Color Hunter is not affiliated with either. Codes are the nearest match to published sRGB approximations, not official color data; confirm with a physical guide before ordering paint or print.':
      'PANTONE® علامت تجاری ثبت‌شده Pantone LLC و RAL علامت تجاری RAL gGmbH است. Color Hunter به هیچ‌کدام وابسته نیست. کدها نزدیک‌ترین تطبیق با تقریب‌های منتشرشده sRGB هستند، نه داده رسمی رنگ؛ پیش از سفارش رنگ یا چاپ با راهنمای فیزیکی تطبیق بده.',
    'Skip': 'رد کردن',
    'Next': 'بعدی',
    'Start': 'شروع',
    'Aim. Steady. Locked.': 'نشانه بگیر. ثابت نگه دار. قفل شد.',
    'Point the center at any surface and keep still: the ring fills and the reading locks by itself. Or hold your finger anywhere for a precise spot. The longer the ring runs, the more frames are averaged.':
      'مرکز کادر را روی هر سطحی بگیر و ثابت بمان: حلقه پر می‌شود و خوانش خودش قفل می‌شود. یا برای یک نقطه دقیق، انگشتت را هر جا نگه دار. هرچه حلقه بیشتر بچرخد، فریم‌های بیشتری میانگین گرفته می‌شوند.',
    'It reads the light, too.': 'نور را هم می‌خواند.',
    'The needle shows the color temperature of your scene and tells sun from shade, cloud or lamp. Colors are corrected for that light, so a wall reads the same at noon and at dusk.':
      'عقربه دمای رنگ صحنه‌ات را نشان می‌دهد و آفتاب را از سایه، ابر یا لامپ تشخیص می‌دهد. رنگ‌ها برای همان نور تصحیح می‌شوند، پس یک دیوار ظهر و غروب یک‌جور خوانده می‌شود.',
    'Calibrate, then know the error.': 'کالیبره کن، بعد خطا را بدان.',
    'Capture a 24-patch chart once and the app fits a correction for your camera, then measures how well it holds on patches it did not fit. You get a real error figure instead of a promise. A phone is still not a spectrophotometer.':
      'یک‌بار چارت ۲۴ خانه را ثبت کن تا اپ یک تصحیح برای دوربینت برازش کند، بعد می‌سنجد که این تصحیح روی خانه‌هایی که در برازش نبوده‌اند چقدر دوام می‌آورد. به‌جای یک وعده، یک عدد خطای واقعی می‌گیری. گوشی همچنان اسپکتروفتومتر نیست.',
    'Compare, hunt, keep.': 'مقایسه کن، شکار کن، نگه دار.',
    'Compare two swatches to see if they truly match. Hunt a random Pantone out in the world. Save what you find to your color book and share any color as a card.':
      'دو نمونه را مقایسه کن تا ببینی واقعاً یکی هستند یا نه. یک Pantone تصادفی را در دنیای بیرون شکار کن. هرچه پیدا کردی در دفتر رنگت ذخیره کن و هر رنگی را به شکل کارت به اشتراک بگذار.',

    'Print on matte paper with any "color enhancement" in the printer turned off. Patch 1 (dark brown) goes top left. Printed colors drift slightly from the reference, so a laser printer, a print shop or a real ColorChecker gives the best result.':
      'روی کاغذ مات چاپ کن و هر گزینه «بهبود رنگ» چاپگر را خاموش کن. خانه ۱ (قهوه‌ای تیره) بالا سمت چپ قرار می‌گیرد. رنگ‌های چاپی کمی از مرجع فاصله می‌گیرند، پس چاپگر لیزری، چاپخانه یا یک ColorChecker واقعی بهترین نتیجه را می‌دهد.',

    /* ---- update bar ---- */
    'A new version of Color Hunter is ready.': 'نسخه تازه‌ای از Color Hunter آماده است.',
    'Later': 'بعداً',
    'Reload': 'بارگذاری دوباره',

    /* ---- colour names from describe() ---- */
    'White': 'سفید', 'Pale Grey': 'خاکستری کم‌رنگ', 'Light Grey': 'خاکستری روشن',
    'Grey': 'خاکستری', 'Charcoal': 'زغالی', 'Black': 'سیاه',
    'Magenta': 'سرخابی', 'Red': 'قرمز', 'Orange': 'نارنجی', 'Amber': 'کهربایی',
    'Yellow': 'زرد', 'Lime': 'مغز‌پسته‌ای', 'Green': 'سبز', 'Teal': 'فیروزه‌ای',
    'Blue': 'آبی', 'Violet': 'بنفش', 'Brown': 'قهوه‌ای', 'Beige': 'بژ',
    'Cream': 'کرم', 'Olive': 'زیتونی', 'Pink': 'صورتی', 'Navy': 'سرمه‌ای', 'Crimson': 'زرشکی',
    'very light': 'خیلی روشن', 'light': 'روشن', 'very dark': 'خیلی تیره', 'dark': 'تیره',
    'muted': 'مات', 'vivid': 'پرمایه'
  };

  var DICT = { en: null, fa: fa };
  var lang = 'en';

  function sub(s, v) {
    if (!v) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) {
      return v[k] === undefined || v[k] === null ? m : v[k];
    });
  }

  function t(s, v) {
    var d = DICT[lang];
    return sub((d && d[s]) || s, v);
  }

  function set(l) { lang = DICT[l] !== undefined ? l : 'en'; return lang; }
  function get() { return lang; }
  function dir() { return LANGS[lang].dir; }
  function speechLang() { return LANGS[lang].speech; }
  function detect(nav) {
    var l = (nav && (nav.language || (nav.languages && nav.languages[0]))) || '';
    return /^fa|^pe/i.test(l) ? 'fa' : 'en';
  }

  /* Translate the static markup. The English text already in the document is the
     key, captured once on the first pass so switching language twice cannot
     translate a translation. */
  function applyDom(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.dataset.en === undefined) n.dataset.en = n.textContent;
      n.textContent = t(n.dataset.en);
    }
    var attrNodes = scope.querySelectorAll('[data-i18n-attr]');
    for (var j = 0; j < attrNodes.length; j++) {
      var e = attrNodes[j], list = e.dataset.i18nAttr.split(',');
      for (var k = 0; k < list.length; k++) {
        var a = list[k].trim(), store = 'en' + a.replace(/[^a-z]/gi, '');
        if (e.dataset[store] === undefined) e.dataset[store] = e.getAttribute(a) || '';
        e.setAttribute(a, t(e.dataset[store]));
      }
    }
    if (scope === document) {
      document.documentElement.lang = lang;
      document.documentElement.dir = dir();
    }
  }

  /* Every English string the app can show, for the completeness test. */
  function keys() { return Object.keys(fa); }

  return {
    LANGS: LANGS, t: t, set: set, get: get, dir: dir, speechLang: speechLang,
    detect: detect, applyDom: applyDom, keys: keys, dict: DICT
  };
}));
