<?php
/**
 * Plugin Name: Scribe Flipbook
 * Description: Turn Media Library PDFs into self-hosted, animated flipbooks. Embed with [scribe_flipbook id="123"].
 * Version: 1.1.0
 * Requires at least: 6.5
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 * Text Domain: scribe-flipbook
 */

defined( 'ABSPATH' ) || exit;

final class Scribe_Flipbook {
    const VERSION = '1.1.0';
    public function __construct() {
        add_action( 'init', array( $this, 'register' ) );
        add_action( 'init', array( $this, 'rewrite_upgrade' ), 20 );
        add_filter( 'template_include', array( $this, 'reader_template' ) );
        add_action( 'add_meta_boxes', array( $this, 'boxes' ) );
        add_action( 'save_post_scribe_flipbook', array( $this, 'save' ) );
        add_action( 'admin_enqueue_scripts', array( $this, 'admin_assets' ) );
        add_action( 'admin_menu', array( $this, 'menu' ) );
        add_action( 'wp_enqueue_scripts', array( $this, 'viewer_style' ) );
        add_action( 'wp_ajax_scribe_library', array( $this, 'library_action' ) );
        add_action( 'wp_ajax_scribe_view', array( $this, 'record_view' ) );
        add_action( 'wp_ajax_nopriv_scribe_view', array( $this, 'record_view' ) );
        add_shortcode( 'scribe_flipbook', array( $this, 'shortcode' ) );
        add_filter( 'manage_scribe_flipbook_posts_columns', function ( $columns ) {
            $columns['scribe_embed'] = __( 'Embed shortcode', 'scribe-flipbook' );
            return $columns;
        } );
        add_action( 'manage_scribe_flipbook_posts_custom_column', function ( $column, $id ) {
            if ( 'scribe_embed' === $column ) echo '<code>[scribe_flipbook id="' . absint( $id ) . '"]</code>';
        }, 10, 2 );
    }

    public function register() {
        register_post_type( 'scribe_flipbook', array(
            'labels' => array( 'name' => __( 'Flipbooks', 'scribe-flipbook' ), 'singular_name' => __( 'Flipbook', 'scribe-flipbook' ), 'add_new_item' => __( 'Add Flipbook', 'scribe-flipbook' ), 'edit_item' => __( 'Edit Flipbook', 'scribe-flipbook' ) ),
            'public' => true, 'publicly_queryable' => true, 'exclude_from_search' => true,
            'has_archive' => false, 'rewrite' => array( 'slug' => 'flipbook', 'with_front' => false ),
            'show_ui' => true, 'show_in_rest' => false, 'show_in_menu' => false,
            'menu_icon' => 'dashicons-book-alt', 'supports' => array( 'title' ),
            // Match the administrator-only library on direct editor and core API paths.
            'map_meta_cap' => false,
            'capabilities' => array_fill_keys( array( 'edit_post', 'read_post', 'delete_post', 'edit_posts', 'edit_others_posts', 'publish_posts', 'read_private_posts', 'delete_posts', 'delete_private_posts', 'delete_published_posts', 'delete_others_posts', 'edit_private_posts', 'edit_published_posts', 'create_posts' ), 'manage_options' ),
        ) );
    }

    public function rewrite_upgrade() {
        if ( self::VERSION !== get_option( 'scribe_flipbook_rewrite_version' ) ) {
            flush_rewrite_rules( false );
            update_option( 'scribe_flipbook_rewrite_version', self::VERSION );
        }
    }

    public function reader_template( $template ) {
        if ( ! is_singular( 'scribe_flipbook' ) ) return $template;
        show_admin_bar( false );
        remove_action( 'wp_head', '_admin_bar_bump_cb' );
        remove_action( 'wp_head', '_wp_render_title_tag', 1 );
        nocache_headers();
        if ( '0' === get_post_meta( get_queried_object_id(), '_scribe_active', true ) ) status_header( 404 );
        return __DIR__ . '/templates/reader.php';
    }

    public function menu() {
        add_menu_page( 'Flipbooks', 'Flipbooks', 'manage_options', 'scribe-flipbooks', array( $this, 'library' ), 'dashicons-book-alt' );
    }

    public function library() {
        if ( ! current_user_can( 'manage_options' ) ) return;
        $search = isset( $_GET['s'] ) && is_string( $_GET['s'] ) ? sanitize_text_field( wp_unslash( $_GET['s'] ) ) : '';
        $page = isset( $_GET['sfb_page'] ) && is_scalar( $_GET['sfb_page'] ) ? max( 1, absint( $_GET['sfb_page'] ) ) : 1;
        $query = new WP_Query( array( 'post_type' => 'scribe_flipbook', 'post_status' => array( 'publish', 'draft', 'pending', 'private' ), 'posts_per_page' => 20, 'paged' => $page, 's' => $search, 'orderby' => array( 'date' => 'DESC', 'ID' => 'DESC' ) ) );
        $books = $query->posts;
        ?>
        <div class="wrap sfb-library" data-assets="<?php echo esc_url( plugins_url( 'assets/', __FILE__ ) ); ?>" data-endpoint="<?php echo esc_url( admin_url( 'admin-ajax.php' ) ); ?>" data-nonce="<?php echo esc_attr( wp_create_nonce( 'scribe_library' ) ); ?>">
            <h1 class="wp-heading-inline">Flipbooks</h1>
            <a class="page-title-action" id="sfb-add" href="<?php echo esc_url( admin_url( 'post-new.php?post_type=scribe_flipbook' ) ); ?>">Add PDF</a>
            <hr class="wp-header-end">
            <div id="sfb-library-message" class="notice notice-info inline" role="status" aria-live="polite" hidden><p></p></div>
            <form method="get" action="<?php echo esc_url( admin_url( 'admin.php' ) ); ?>"><input type="hidden" name="page" value="scribe-flipbooks"><p class="search-box"><label class="screen-reader-text" for="sfb-search">Search flipbooks</label><input type="search" id="sfb-search" name="s" value="<?php echo esc_attr( $search ); ?>"><button type="submit" class="button">Search flipbooks</button></p></form>
            <div class="tablenav top"><div class="tablenav-pages"><span class="displaying-num"><?php echo esc_html( sprintf( _n( '%s item', '%s items', $query->found_posts, 'scribe-flipbook' ), number_format_i18n( $query->found_posts ) ) ); ?></span></div></div>
            <div class="sfb-table-wrap">
            <table class="widefat fixed striped sfb-table">
                <caption class="screen-reader-text">Flipbook library</caption>
                <thead><tr><th scope="col" class="sfb-cover-column"><span class="screen-reader-text">Cover</span></th><th scope="col">Title / reader link</th><th scope="col" class="sfb-status-column">Status</th><th scope="col" class="sfb-shortcode-column">Shortcode</th><th scope="col" class="sfb-number-column">Pages</th><th scope="col" class="sfb-number-column">Views</th><th scope="col" class="sfb-actions-column">Actions</th></tr></thead>
                <tbody>
            <?php foreach ( $books as $book ) :
                $pdf = absint( get_post_meta( $book->ID, '_scribe_pdf', true ) );
                $active = 'publish' === $book->post_status && '0' !== get_post_meta( $book->ID, '_scribe_active', true );
                $pages = absint( get_post_meta( $book->ID, '_scribe_pages', true ) );
                $views = absint( get_post_meta( $book->ID, '_scribe_views', true ) );
                ?>
                <tr class="sfb-row" data-id="<?php echo absint( $book->ID ); ?>" data-pdf-id="<?php echo $pdf; ?>" data-title="<?php echo esc_attr( $book->post_title ); ?>" data-pdf="<?php echo esc_url( wp_get_attachment_url( $pdf ) ); ?>" data-pages="<?php echo $pages; ?>">
                    <td><div class="sfb-cover"><?php echo wp_get_attachment_image( $pdf, array( 44, 60 ), true ); ?></div></td>
                    <td><strong><a class="row-title" href="<?php echo esc_url( get_edit_post_link( $book->ID ) ); ?>"><?php echo esc_html( $book->post_title ); ?></a></strong><p class="description"><a href="<?php echo esc_url( get_permalink( $book->ID ) ); ?>" target="_blank" rel="noopener"><?php echo esc_html( get_permalink( $book->ID ) ); ?></a></p></td>
                    <td><label class="sfb-status-toggle"><input type="checkbox" data-command="toggle" role="switch" aria-label="<?php echo esc_attr( 'Active: ' . $book->post_title ); ?>" <?php checked( $active ); ?>><span class="sfb-toggle-track" aria-hidden="true"></span><span class="sfb-active-label"><?php echo $active ? 'Active' : 'Inactive'; ?></span></label></td>
                    <td><input class="sfb-shortcode code" type="text" readonly aria-label="<?php echo esc_attr( 'Shortcode: ' . $book->post_title ); ?>" value="<?php echo esc_attr( '[scribe_flipbook id="' . $book->ID . '"]' ); ?>"></td>
                    <td class="sfb-pages"><?php echo $pages ? esc_html( number_format_i18n( $pages ) ) : 'Loading…'; ?></td>
                    <td><?php echo esc_html( number_format_i18n( $views ) ); ?></td>
                    <td class="sfb-row-actions"><a class="button" href="<?php echo esc_url( get_permalink( $book->ID ) ); ?>" target="_blank" rel="noopener">View</a> <a class="button" data-command="replace" href="<?php echo esc_url( get_edit_post_link( $book->ID ) ); ?>">Replace PDF</a> <a class="button" href="<?php echo esc_url( get_edit_post_link( $book->ID ) ); ?>">Edit</a></td>
                </tr>
            <?php endforeach; ?>
                <tr id="sfb-empty" <?php if ( $books ) echo 'hidden'; ?>><td colspan="7">No flipbooks found.</td></tr>
                </tbody>
            </table>
            </div>
            <div class="tablenav bottom"><div class="tablenav-pages"><?php echo wp_kses_post( paginate_links( array( 'base' => admin_url( 'admin.php' ) . '%_%', 'format' => '?page=scribe-flipbooks&sfb_page=%#%', 'current' => $page, 'total' => $query->max_num_pages, 'add_args' => $search ? array( 's' => $search ) : array() ) ) ); ?></div></div>
            <p class="description">Views count approximate reader sessions. Admin previews are excluded. Inactive flipbooks are hidden from embeds; original Media Library PDF URLs remain public.</p>
        </div>
        <?php
    }

    private function posted_integer( $key, $minimum = 1 ) {
        $value = isset( $_POST[ $key ] ) && is_scalar( $_POST[ $key ] ) ? wp_unslash( (string) $_POST[ $key ] ) : '';
        $number = filter_var( $value, FILTER_VALIDATE_INT, array( 'options' => array( 'min_range' => $minimum ) ) );
        if ( false === $number ) wp_send_json_error( array( 'message' => 'Invalid ' . $key . '.' ), 400 );
        return $number;
    }

    public function library_action() {
        check_ajax_referer( 'scribe_library', 'nonce' );
        if ( ! current_user_can( 'manage_options' ) || ! current_user_can( 'upload_files' ) ) wp_send_json_error( array( 'message' => 'Permission denied.' ), 403 );
        $command = isset( $_POST['command'] ) && is_string( $_POST['command'] ) ? sanitize_key( wp_unslash( $_POST['command'] ) ) : '';
        $id = 'create' === $command ? 0 : $this->posted_integer( 'id' );
        if ( 'create' !== $command && ( 'scribe_flipbook' !== get_post_type( $id ) || ! current_user_can( 'edit_post', $id ) ) ) wp_send_json_error( array( 'message' => 'Flipbook not found.' ), 404 );
        if ( in_array( $command, array( 'create', 'replace' ), true ) ) {
            $pdf = $this->posted_integer( 'pdf' );
            if ( 'attachment' !== get_post_type( $pdf ) || 'application/pdf' !== get_post_mime_type( $pdf ) || ! current_user_can( 'edit_post', $pdf ) ) wp_send_json_error( array( 'message' => 'Choose a PDF from your Media Library.' ), 400 );
            if ( 'create' === $command ) {
                if ( ! current_user_can( 'publish_posts' ) ) wp_send_json_error( array( 'message' => 'Cannot publish flipbooks.' ), 403 );
                $id = wp_insert_post( wp_slash( array( 'post_type' => 'scribe_flipbook', 'post_status' => 'publish', 'post_title' => get_post_field( 'post_title', $pdf, 'raw' ) ) ), true );
                if ( is_wp_error( $id ) ) wp_send_json_error( array( 'message' => $id->get_error_message() ), 500 );
                update_post_meta( $id, '_scribe_active', '1' );
                add_post_meta( $id, '_scribe_views', 0, true );
            }
            update_post_meta( $id, '_scribe_pdf', $pdf );
            delete_post_meta( $id, '_scribe_pages' );
        } elseif ( 'toggle' === $command ) {
            if ( ! isset( $_POST['active'] ) || ! is_string( $_POST['active'] ) || ! in_array( $_POST['active'], array( '0', '1' ), true ) ) wp_send_json_error( array( 'message' => 'Invalid status.' ), 400 );
            $active = '1' === $_POST['active'];
            if ( $active && 'publish' !== get_post_status( $id ) ) {
                if ( ! current_user_can( 'publish_posts' ) ) wp_send_json_error( array( 'message' => 'Cannot publish flipbooks.' ), 403 );
                $result = wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ), true );
                if ( is_wp_error( $result ) ) wp_send_json_error( array( 'message' => $result->get_error_message() ), 500 );
            }
            update_post_meta( $id, '_scribe_active', $active ? '1' : '0' );
        } elseif ( 'pages' === $command ) {
            // Ignore page counts computed for an older PDF replaced in another tab.
            if ( $this->posted_integer( 'pdf' ) !== absint( get_post_meta( $id, '_scribe_pdf', true ) ) ) wp_send_json_error( array( 'message' => 'PDF changed. Reload the library.' ), 409 );
            $pages = $this->posted_integer( 'pages' );
            if ( $pages > 100000 ) wp_send_json_error( array( 'message' => 'Invalid page count.' ), 400 );
            update_post_meta( $id, '_scribe_pages', $pages );
        } else wp_send_json_error( array( 'message' => 'Unknown action.' ), 400 );
        wp_send_json_success( array( 'id' => $id ) );
    }

    public function record_view() {
        $id = $this->posted_integer( 'id' );
        if ( ! isset( $_POST['nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['nonce'] ) ), 'scribe_view_' . $id ) ) wp_send_json_error( null, 403 );
        if ( 'scribe_flipbook' !== get_post_type( $id ) || 'publish' !== get_post_status( $id ) || '0' === get_post_meta( $id, '_scribe_active', true ) || post_password_required( $id ) ) wp_send_json_error( null, 404 );
        if ( current_user_can( 'edit_post', $id ) ) wp_send_json_success();
        $key = 'sfb_view_' . md5( $id . '|' . ( $_SERVER['REMOTE_ADDR'] ?? '' ) . wp_salt() );
        if ( ! get_transient( $key ) ) {
            set_transient( $key, 1, 30 * MINUTE_IN_SECONDS );
            add_post_meta( $id, '_scribe_views', 0, true );
            global $wpdb;
            $wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->postmeta} SET meta_value = CAST(meta_value AS UNSIGNED) + 1 WHERE post_id = %d AND meta_key = '_scribe_views'", $id ) );
            wp_cache_delete( $id, 'post_meta' );
        }
        wp_send_json_success();
    }

    public function boxes() {
        add_meta_box( 'scribe-pdf', __( 'Flipbook PDF', 'scribe-flipbook' ), array( $this, 'box' ), 'scribe_flipbook', 'normal', 'high' );
    }

    public function box( $post ) {
        $pdf = absint( get_post_meta( $post->ID, '_scribe_pdf', true ) );
        wp_nonce_field( 'scribe_save_pdf', 'scribe_pdf_nonce' );
        echo '<p>' . esc_html__( 'Upload a PDF or choose one from your Media Library, then publish the flipbook.', 'scribe-flipbook' ) . '</p>';
        echo '<input type="hidden" id="scribe-pdf-id" name="scribe_pdf_id" value="' . $pdf . '">';
        echo '<p id="scribe-pdf-name">' . esc_html( $pdf ? get_the_title( $pdf ) : __( 'No PDF selected.', 'scribe-flipbook' ) ) . '</p>';
        echo '<button type="button" class="button button-primary" id="scribe-select-pdf">' . esc_html__( 'Upload / choose PDF', 'scribe-flipbook' ) . '</button> ';
        echo '<button type="button" class="button" id="scribe-remove-pdf">' . esc_html__( 'Remove PDF', 'scribe-flipbook' ) . '</button>';
        echo '<p><label><input type="checkbox" name="scribe_download" value="1" ' . checked( get_post_meta( $post->ID, '_scribe_download', true ), '1', false ) . '> ' . esc_html__( 'Show a link to download the original PDF', 'scribe-flipbook' ) . '</label></p>';
        echo '<p>' . esc_html__( 'Embed this flipbook in a Shortcode block:', 'scribe-flipbook' ) . ' <code>[scribe_flipbook id="' . absint( $post->ID ) . '"]</code></p>';
        echo '<p><a href="' . esc_url( get_permalink( $post->ID ) ) . '" target="_blank" rel="noopener">' . esc_html__( 'Open full-page reader', 'scribe-flipbook' ) . '</a></p>';
        echo '<p class="description">' . esc_html__( 'Edit the permalink below the title to change this flipbook’s reader address.', 'scribe-flipbook' ) . '</p>';
        echo '<p class="description">' . esc_html__( 'Media Library files have public URLs. Use this plugin for public publications, not confidential documents. Hiding the download link does not protect the PDF.', 'scribe-flipbook' ) . '</p>';
    }

    public function save( $id ) {
        if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE || wp_is_post_revision( $id ) ) return;
        if ( ! current_user_can( 'manage_options' ) || ! current_user_can( 'edit_post', $id ) || ! current_user_can( 'upload_files' ) ) return;
        if ( ! isset( $_POST['scribe_pdf_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['scribe_pdf_nonce'] ) ), 'scribe_save_pdf' ) ) return;
        if ( ! isset( $_POST['scribe_pdf_id'] ) || ! is_scalar( $_POST['scribe_pdf_id'] ) ) return;
        $pdf = filter_var( wp_unslash( (string) $_POST['scribe_pdf_id'] ), FILTER_VALIDATE_INT, array( 'options' => array( 'min_range' => 0 ) ) );
        if ( false === $pdf ) return;
        if ( $pdf && ( 'attachment' !== get_post_type( $pdf ) || 'application/pdf' !== get_post_mime_type( $pdf ) || ! current_user_can( 'edit_post', $pdf ) ) ) return;
        if ( $pdf !== absint( get_post_meta( $id, '_scribe_pdf', true ) ) ) delete_post_meta( $id, '_scribe_pages' );
        update_post_meta( $id, '_scribe_pdf', $pdf );
        update_post_meta( $id, '_scribe_download', isset( $_POST['scribe_download'] ) ? '1' : '0' );
    }

    public function admin_assets( $hook ) {
        $screen = get_current_screen();
        if ( 'toplevel_page_scribe-flipbooks' === $hook ) {
            wp_enqueue_media();
            wp_enqueue_style( 'scribe-library', plugins_url( 'assets/library.css', __FILE__ ), array(), self::VERSION );
            wp_enqueue_script( 'scribe-library', plugins_url( 'assets/library.js', __FILE__ ), array( 'media-editor', 'media-views' ), self::VERSION, true );
            return;
        }
        if ( ! $screen || 'scribe_flipbook' !== $screen->post_type || ! in_array( $hook, array( 'post.php', 'post-new.php' ), true ) ) return;
        wp_enqueue_media();
        wp_enqueue_script( 'scribe-flipbook-admin', plugins_url( 'assets/admin.js', __FILE__ ), array( 'jquery', 'media-views' ), '1.0.0', true );
    }

    public function viewer_style() {
        // Shortcodes in classic templates can render after wp_head. Queue this
        // small stylesheet in the head; PDF and flip libraries stay conditional.
        wp_enqueue_style( 'scribe-flipbook', plugins_url( 'assets/viewer.css', __FILE__ ), array(), self::VERSION );
    }

    public function shortcode( $atts ) {
        $atts = shortcode_atts( array( 'id' => 0 ), $atts, 'scribe_flipbook' );
        $id = absint( $atts['id'] );
        if ( '0' === get_post_meta( $id, '_scribe_active', true ) ) return '';
        if ( 'scribe_flipbook' !== get_post_type( $id ) || ( 'publish' !== get_post_status( $id ) && ! current_user_can( 'edit_post', $id ) ) || post_password_required( $id ) ) return '';
        $pdf = absint( get_post_meta( $id, '_scribe_pdf', true ) );
        $url = wp_get_attachment_url( $pdf );
        if ( ! $url || 'application/pdf' !== get_post_mime_type( $pdf ) ) return '<p>' . esc_html__( 'This flipbook has no PDF yet.', 'scribe-flipbook' ) . '</p>';
        $this->viewer_style();
        wp_enqueue_script( 'scribe-page-flip', plugins_url( 'assets/vendor/page-flip.js', __FILE__ ), array(), '2.0.7', true );
        wp_enqueue_script( 'scribe-flipbook-viewer', plugins_url( 'assets/viewer.js', __FILE__ ), array( 'scribe-page-flip' ), self::VERSION, true );
        ob_start();
        ?>
        <section class="sfb" data-assets="<?php echo esc_url( plugins_url( 'assets/', __FILE__ ) ); ?>" data-version="<?php echo esc_attr( self::VERSION ); ?>" data-id="<?php echo $id; ?>" data-endpoint="<?php echo esc_url( admin_url( 'admin-ajax.php' ) ); ?>" data-nonce="<?php echo esc_attr( wp_create_nonce( 'scribe_view_' . $id ) ); ?>" data-pdf="<?php echo esc_url( $url ); ?>" aria-label="<?php echo esc_attr( get_the_title( $id ) ); ?>" tabindex="0">
            <header class="sfb-toolbar">
                <strong class="sfb-title"><?php echo esc_html( get_the_title( $id ) ); ?></strong>
                <button type="button" data-action="thumbnails" aria-expanded="false"><?php esc_html_e( 'Thumbnails', 'scribe-flipbook' ); ?></button>
                <?php if ( '1' === get_post_meta( $id, '_scribe_download', true ) ) : ?>
                    <a href="<?php echo esc_url( $url ); ?>" target="_blank" rel="noopener" download><?php esc_html_e( 'Download PDF', 'scribe-flipbook' ); ?></a>
                <?php endif; ?>
                <button type="button" data-action="fullscreen"><?php esc_html_e( 'Fullscreen', 'scribe-flipbook' ); ?></button>
            </header>
            <div class="sfb-body">
                <aside class="sfb-thumbnails" aria-label="<?php esc_attr_e( 'Page thumbnails', 'scribe-flipbook' ); ?>" hidden></aside>
                <div class="sfb-stage"><div class="sfb-book"></div></div>
            </div>
            <p class="sfb-status" role="status" aria-live="polite"><?php esc_html_e( 'Loading PDF…', 'scribe-flipbook' ); ?></p>
            <p class="sfb-error-fallback" hidden><a href="<?php echo esc_url( $url ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'Open original PDF', 'scribe-flipbook' ); ?></a></p>
            <footer class="sfb-controls">
                <button type="button" data-action="previous" disabled aria-label="<?php esc_attr_e( 'Previous page', 'scribe-flipbook' ); ?>">&#8592;</button>
                <label><?php esc_html_e( 'Page', 'scribe-flipbook' ); ?> <input class="sfb-page-number" type="number" min="1" value="1" disabled></label>
                <span class="sfb-count">/ —</span>
                <input class="sfb-range" type="range" min="1" value="1" disabled aria-label="<?php esc_attr_e( 'Go to page', 'scribe-flipbook' ); ?>">
                <button type="button" data-action="next" disabled aria-label="<?php esc_attr_e( 'Next page', 'scribe-flipbook' ); ?>">&#8594;</button>
            </footer>
            <noscript><?php esc_html_e( 'Enable JavaScript to view the flipbook.', 'scribe-flipbook' ); ?></noscript>
        </section>
        <?php
        return ob_get_clean();
    }
}
new Scribe_Flipbook();
