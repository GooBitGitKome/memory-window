import { useEffect, useState } from 'react';

const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

export function formatWallClock(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = weekdays[date.getDay()];
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return {
    dateText: `${year}年${month}月${day}日（${weekday}）`,
    dateValue: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    timeText: `${hour}:${minute}`,
  };
}

/** Local date and time on the empty wall; wake-up refresh handles suspended tabs. */
export function WallClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      setNow(new Date());
      timer = setTimeout(refresh, 60_000 - Date.now() % 60_000 + 100);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer);
        refresh();
      }
    };
    refresh();
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, []);

  const { dateText, dateValue, timeText } = formatWallClock(now);
  return <div className="wall-clock" role="group" aria-label="今日の日付と現在の時刻">
    <time className="wall-date" dateTime={dateValue}>{dateText}</time>
    <time className="wall-time" dateTime={timeText}>{timeText}</time>
  </div>;
}
