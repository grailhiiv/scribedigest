<?php
defined( 'ABSPATH' ) || exit;
$book_id = get_queried_object_id();
$active = '0' !== get_post_meta( $book_id, '_scribe_active', true );
?><!doctype html>
<html class="sfb-reader-document" <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo( 'charset' ); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?php echo esc_html( $active ? get_the_title( $book_id ) : __( 'Flipbook unavailable', 'scribe-flipbook' ) ); ?></title>
    <?php wp_head(); ?>
</head>
<body class="sfb-reader">
<?php
wp_body_open();
if ( ! $active ) {
    echo '<main class="sfb-reader-message"><h1>' . esc_html__( 'Flipbook unavailable', 'scribe-flipbook' ) . '</h1><p>' . esc_html__( 'This publication is currently inactive.', 'scribe-flipbook' ) . '</p></main>';
} elseif ( post_password_required( $book_id ) ) {
    echo '<main class="sfb-reader-message">' . get_the_password_form( $book_id ) . '</main>'; // Core generates the escaped password form.
} else {
    echo do_shortcode( '[scribe_flipbook id="' . absint( $book_id ) . '"]' );
}
wp_footer();
?>
</body>
</html>
