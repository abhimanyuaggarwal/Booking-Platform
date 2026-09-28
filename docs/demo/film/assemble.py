# Assembles the Hindi demo film: story cards + screen recordings + one narration file per beat.
# Voice: <id>.aiff made by `say -v Lekha`, or a human recording <VOICE_DIR>/<id>.m4a|.wav|.mp3 when present.
import json, subprocess, os, sys
D = os.path.dirname(os.path.abspath(__file__)); S = os.path.dirname(D)
FF = S + '/node_modules/ffmpeg-static/ffmpeg'; FP = S + '/node_modules/ffprobe-static/bin/darwin/arm64/ffprobe'
VOICE_DIR = os.environ.get('VOICE_DIR', '')
rec = json.load(open(f'{S}/film2/recording.json')); rec.update(json.load(open(f'{D}/recording-desk.json')))
BG = '0xF4F1EA'
def dur(p): return float(subprocess.check_output([FP, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode().strip())
def voice(id_):
    for ext in ('m4a', 'wav', 'mp3'):
        p = f'{VOICE_DIR}/{id_}.{ext}'
        if VOICE_DIR and os.path.exists(p): return p
    return f'{D}/{id_}.aiff'
def last_frame(src, at, out):
    at = min(at, dur(src) - 0.35)   # a recording can end a little before its last mark
    subprocess.run([FF, '-v', 'error', '-y', '-ss', f'{at:.2f}', '-i', src, '-frames:v', '1', out], check=True)
    assert os.path.exists(out), f'no frame at {at:.2f}s of {src}'
    return out
def clip(name, parts, cap=None, tail=0.7):
    v = voice(name); n = dur(v)
    total = sum(p[2] for p in parts)
    if total < n + tail:
        src, start, length = parts[-1]
        if src == 'png': parts[-1] = (src, start, length + (n + tail - total))
        else: parts.append(('png', last_frame(src, start + length - 0.15, f'{D}/hold-{name}.png'), n + tail - total))
        total = n + tail
    subs = []
    for i, (src, start, length) in enumerate(parts):
        out = f'{D}/clip-{name}-{i}.mp4'
        if src == 'png':
            inputs = ['-loop', '1', '-t', f'{length:.2f}', '-i', start]
            vf = f'[0:v]scale=w=1920:h=1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color={BG},fps=30,format=yuv420p[v0]'
        else:
            inputs = ['-ss', f'{start:.2f}', '-t', f'{length:.2f}', '-i', src]
            vf = f'[0:v]scale=w=1920:h=1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color={BG},fps=30,format=yuv420p[v0]'
        if cap and (src != 'png' or start.startswith(f'{D}/hold-')): inputs += ['-i', f'{cap}.png']; vf += ';[v0][1:v]overlay=0:0[v]'
        else: vf += ';[v0]null[v]'
        subprocess.run([FF, '-v', 'error', '-y', *inputs, '-filter_complex', vf, '-map', '[v]', '-t', f'{length:.2f}', '-an', '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p', out], check=True)
        subs.append(out)
    lst = f'{D}/clip-{name}.txt'; open(lst, 'w').write(''.join(f"file '{c}'\n" for c in subs))
    silent = f'{D}/clip-{name}-v.mp4'; subprocess.run([FF, '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', silent], check=True)
    out = f'{D}/clip-{name}.mp4'
    subprocess.run([FF, '-v', 'error', '-y', '-i', silent, '-i', v, '-filter_complex', f'[1:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur={total:.2f}[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-t', f'{total:.2f}', out], check=True)
    print(f'{name}: {total:.1f}s (voice {n:.1f}s)'); return out
vid = lambda k: rec[k]['video']; m = lambda k: rec[k]['marks']
LIVE = S + '/story/live-frame.png'; F2 = S + '/film2'
c = m('console'); hindi_start = max(0.0, c['today'] - 1.0); hindi_len = c['hindi'] - hindi_start + 4.5
w = m('week'); s = m('settings')
clips = [
  clip('00-cover', [('png', f'{D}/cover.png', 6.5)]),
  clip('01-scene', [('png', f'{D}/scene.png', 10.0)]),
  clip('02-pain', [('png', f'{D}/pain.png', 14.0)]),
  clip('03-idea', [('png', f'{D}/idea.png', 9.0)]),
  clip('04-meera', [('png', f'{D}/meera.png', 9.0)]),
  clip('05-scan', [('png', LIVE, 3.0), (vid('whatsapp'), 0.3, 13.0)], f'{F2}/cap-wa'),
  clip('06-pay', [(vid('pay'), 0.5, 8.8), (vid('confirmed'), 0.5, 4.0)], f'{F2}/cap-pay'),
  clip('07-waiting', [(vid('her'), 1.0, 13.5)], f'{F2}/cap-waiting'),
  clip('08-guruji', [(vid('guru'), 0.5, 13.5), (vid('her'), 29.0, 4.0)], f'{F2}/cap-guru'),
  clip('09-week', [(vid('week'), w['grid'] - 1.5, w['end'] - (w['grid'] - 1.5))], f'{D}/cap-week'),
  clip('10-settings', [(vid('settings'), s['timings'] - 1.2, s['end'] - (s['timings'] - 1.2))], f'{D}/cap-settings'),
  clip('11-door2', [(vid('door2'), 0.5, 20.5)], f'{F2}/cap-door2'),
  clip('12-hindi', [(vid('console'), hindi_start, hindi_len)], f'{D}/cap-hindi'),
  clip('13-ask', [('png', f'{D}/ask.png', 6.5)]),
]
lst = f'{D}/all.txt'; open(lst, 'w').write(''.join(f"file '{c}'\n" for c in clips))
final = f'{D}/samvad-demo-hindi.mp4'
subprocess.run([FF, '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', final], check=True)
print('final', f'{dur(final):.1f}s', f'{os.path.getsize(final)/1e6:.1f} MB')
