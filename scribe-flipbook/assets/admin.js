(function ($) {
    'use strict';
    let frame;
    $('#scribe-select-pdf').on('click', function () {
        if (!frame) {
            frame = wp.media({ title: 'Choose your flipbook PDF', library: { type: 'application/pdf' }, button: { text: 'Use this PDF' }, multiple: false });
            frame.on('select', function () {
                const file = frame.state().get('selection').first().toJSON();
                if (file.mime !== 'application/pdf') return;
                $('#scribe-pdf-id').val(file.id);
                $('#scribe-pdf-name').text(file.title || file.filename);
            });
        }
        frame.open();
    });
    $('#scribe-remove-pdf').on('click', function () {
        $('#scribe-pdf-id').val('0');
        $('#scribe-pdf-name').text('No PDF selected.');
    });
})(jQuery);
