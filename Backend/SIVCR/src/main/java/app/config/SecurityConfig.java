package app.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import model.managers.AuthManager;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Seguridad: API sin sesión de servidor donde cada petición lleva "Authorization: Bearer <token>", emitido por
 * POST /api/auth/login (AuthManager). Solo son públicos el login y la vista pública de agregados nacionales
 * (GET /api/public/summary, "Ingresar sin credenciales", HU 18/19); todo lo demás exige un token vigente, y los permisos
 * por rol los aplican los @PreAuthorize de cada controlador (se verifican en el servidor; el guard de Angular es
 * comodidad).
 *
 * CSRF queda desactivado porque la autenticación va en una cabecera que el navegador no agrega solo (no en una
 * cookie), así que una página ajena no puede hacer peticiones en nombre del usuario.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, AuthManager auth) throws Exception {
        http.cors(Customizer.withDefaults())
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/public/summary").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)));
        http.addFilterBefore(new TokenAuthenticationFilter(auth), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    /** Orígenes del frontend autorizados (sivcr.cors-origenes; por defecto "ng serve" en http://localhost:4200). */
    @Bean
    public CorsConfigurationSource corsConfigurationSource(
            @Value("${sivcr.cors-origenes:http://localhost:4200}") List<String> origenes) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(origenes);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        // sin esto el navegador no deja leer el nombre del archivo de las exportaciones (peticiones entre orígenes)
        config.setExposedHeaders(List.of("Content-Disposition"));
        UrlBasedCorsConfigurationSource fuente = new UrlBasedCorsConfigurationSource();
        fuente.registerCorsConfiguration("/api/**", config);
        return fuente;
    }

    /**
     * Convierte "Authorization: Bearer <token>" en el usuario autenticado: el principal es el User (con su id de app_user)
     * y la autoridad es ROLE_<rol>. Un token ausente o inválido NO rechaza la petición aquí: la deja anónima y es la regla
     * de la cadena (authenticated()) la que responde 401. No es un @Component a propósito: así Spring Boot no lo
     * registra además como filtro suelto del servlet.
     */
    static final class TokenAuthenticationFilter extends OncePerRequestFilter {

        private static final String PREFIJO = "Bearer ";
        private final AuthManager auth;

        TokenAuthenticationFilter(AuthManager auth) {
            this.auth = auth;
        }

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            String cabecera = request.getHeader("Authorization");
            if (SecurityContextHolder.getContext().getAuthentication() == null && cabecera != null
                    && cabecera.regionMatches(true, 0, PREFIJO, 0, PREFIJO.length())) {
                String token = cabecera.substring(PREFIJO.length()).strip();
                auth.usuarioDe(token).ifPresent(u -> SecurityContextHolder.getContext().setAuthentication(
                        new UsernamePasswordAuthenticationToken(u, token,
                                List.of(new SimpleGrantedAuthority("ROLE_" + u.rol())))));
            }
            chain.doFilter(request, response);
        }
    }
}
