var glyphs = {
    'logout': 'e900',
    'application': 'e901',
    'more': 'e902',
    'promote': 'e903',
    'video-off': 'e904',
    'user': 'e905',
    'up-arrow': 'e906',
    'undecided': 'e907',
    'time': 'e908',
    'sad': 'e909',
    'right-arrow': 'e90a',
    'presentation': 'e90b',
    'listen': 'e90c',
    'left-arrow': 'e90d',
    'happy': 'e90e',
    'hand': 'e90f',
    'group-chat': 'e910',
    'confused': 'e911',
    'close': 'e912',
    'clear-status': 'e913',
    'circle': 'e914',
    'substract': 'e915',
    'circle-close': 'e916',
    'add': 'e917',
    'check': 'e918',
    'chat': 'e919',
    'audio-on': 'e91a',
    'audio-off': 'e91b',
    'line-tool': 'e91c',
    'circle-tool': 'e91d',
    'triangle-tool': 'e91e',
    'rectangle-tool': 'e91f',
    'text-tool': 'e920',
    'plus': 'e921',
    'fit-to-width': 'e922',
    'applause': 'e923',
    'undo': 'e924',
    'pen-tool': 'e925',
    'lock': 'e926',
    'polling': 'e927',
    'desktop': 'e928',
    'fit-to-screen': 'e929',
    'fullscreen': 'e92a',
    'settings': 'e92b',
    'thumbs-down': 'e92c',
    'thumbs-up': 'e92d',
    'file': 'e92e',
    'upload': 'e92f',
    'video': 'e930',
    'unmute': 'e931',
    'mute': 'e932',
    'about': 'e933',
    'send': 'e934',
    'exit-fullscreen': 'e935',
    'delete': 'e936',
    'unmute_filled': 'e937',
    'mute_filled': 'e938',
    'listen_filled': 'e939',
    'template_upload': 'e93a',
    'template_download': 'e93b',
    'save_notes': 'e93c',
    'multi_whiteboard': 'e93d',
    'whiteboard': 'e93e',
    'romms': 'e93f',
    'unlock': 'e940',
    'record': 'e941',
    'network': 'e942',
    'redo': 'e943',
    'thumbs_down_filled': 'e944',
    'thumbs_up_filled': 'e945',
    'checkmark': 'e946',
    'speak_louder': 'e947',
    'help': 'e948',
    'refresh': 'e949',
    'copy': 'e94a',
    'shortcuts': 'e94b',
    'warning': 'e94c',
    'transfer_audio': 'e94d',
    'room': 'e94e',
    'new_file': 'e94f',
    'pointer': 'e950',
    'star': 'e951',
    'star_filled': 'e952',
    'desktop_off': 'e953',
    'minus': 'e954',
    'download_off': 'e955',
    'popout_window': 'e956',
    'closed_caption': 'e957',
    'alert': 'e958',
    'pal_rejection': 'e959',
    'no_palm_rejection': 'e95a',
    'device_list_selector': 'e95b',
    'presentation_off': 'e95c',
    'external_video': 'e95d',
    'external_video_off': 'e95d',
    'volume_off': 'e95f',
    'volume_leve_1': 'e960',
    'volume_level_2': 'e961',
    'volume_level_3': 'e962',
    'no_audio': 'e963',
    'pin': 'e964',
    'unpin': 'e965',
    'closed_caption_stop': 'e966',
    'link': 'e967',
    'manage_layout': 'e968'

};

$(document).ready(
    function() {
        renderFont();
        calculateGlyphs();
        $('#liveDemoSize').change(function() {
            $('.fs0').css('font-size', $('#liveDemoSize').val() + 'px');
        })
    }
);

function renderFont() {
    for (name in glyphs) {
        renderGlyph(name, glyphs[name]);
    }
}

function renderGlyph(name, index) {
    var glyphDiv = '<div class="glyph fs1"><div class="clearfix bshadow0 pbs"><span class="icon-icon-bbb-applause"></span><span class="mls"> icon-bbb-' + name + '</span></div>';
    glyphDiv += '<fieldset class="fs0 size1of1 clearfix hidden-false"><input type="text" readonly value="' + index + '" class="unit size1of2" />';
    glyphDiv += '<input type="text" maxlength="1" readonly value="&#x' + index + ';" class="unitRight size1of2 talign-right icon-bbb-' + name + '" />';
    glyphDiv += '</fieldset>';
    glyphDiv += '<div class="fs0 bshadow0 clearfix hidden-true">';
    glyphDiv += '<span class="unit pvs fgc1">liga: </span>';
    glyphDiv += '<input type="text" readonly value="" class="liga unitRight" /></div></div>';

    $('#bbb-container').append(glyphDiv);
}

function calculateGlyphs() {
    $('#glyphs-number').html('(Glyphs:&nbsp;' + Object.keys(glyphs).length + ')');
}
