function formatDate(date) {
    // Опции для форматирования даты
    const options = { weekday: 'long', day: 'numeric', month: 'long' };

    // Форматируем дату
    const formattedDate = date.toLocaleDateString('ru-RU', options);

    // Извлекаем нужные части и приводим первую букву дня недели к заглавной
    const [weekday, dayMonth] = formattedDate.split(', ');
    const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);

    return `${capitalizedWeekday} (${dayMonth})`;
}

function formatTime(time) {
    // Время в формате "HH:mm:ss" или "HH:mm" должно быть преобразовано в "HH:mm"
    // Так как это всего лишь строка, достаточно взять только первые 5 символов
    return time.slice(0, 5)
}

module.exports = { formatDate, formatTime }