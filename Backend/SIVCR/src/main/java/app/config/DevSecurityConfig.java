package app.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
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
 * SOLO DESARROLLO (perfil "dev"). NO ES SEGURIDAD REAL: mientras el bloque de autenticación no entregue el JWT,
 * acepta los tokens falsos que genera el login simulado de Angular ("Bearer mock-jwt-1/2/3", con
 * API_CONFIG.useMock = true) para poder probar la ingesta de punta a punta. Cualquiera que conozca ese texto
 * entra como administrador, por eso jamás debe activarse en un entorno accesible desde fuera.
 *
 * Sin el perfil "dev" esta clase no existe y rige la seguridad por defecto de Spring Boot (todo exige
 * autenticación) hasta que el bloque de autenticación publique su SecurityFilterChain.
 *
 * BORRAR esta clase y DevUserSeeder cuando exista la autenticación real.
 */
@Configuration
@Profile("dev")
public class DevSecurityConfig {

    @Bean
    public SecurityFilterChain devSecurityFilterChain(HttpSecurity http) throws Exception {
        http.cors(Customizer.withDefaults())
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/api/public/**").permitAll()
                        .requestMatchers("/api/dashboard/**").authenticated()
                        .anyRequest().authenticated())
                .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .addFilterBefore(new DevTokenFilter(), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    /** Permite llamar al backend desde "ng serve" (http://localhost:4200). */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of("http://localhost:4200"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        UrlBasedCorsConfigurationSource fuente = new UrlBasedCorsConfigurationSource();
        fuente.registerCorsConfiguration("/api/**", config);
        return fuente;
    }

    /** Traduce "Bearer mock-jwt-<id>" a un usuario de demostración (los mismos de AuthService.USUARIOS_DEMO). */
    static final class DevTokenFilter extends OncePerRequestFilter {

        private static final String PREFIJO = "Bearer mock-jwt-";
        // id -> {correo, rol}; los roles usan los nombres del esquema SQL (ADMIN, ANALISTA, CONSULTOR)
        private static final Map<String, String[]> USUARIOS = Map.of(
                "1", new String[] {"admin@sivcr.go.cr", "ADMIN"},
                "2", new String[] {"analista@sivcr.go.cr", "ANALISTA"},
                "3", new String[] {"consultor@sivcr.go.cr", "CONSULTOR"});

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            String cabecera = request.getHeader("Authorization");
            if (cabecera != null && cabecera.startsWith(PREFIJO)) {
                String[] usuario = USUARIOS.get(cabecera.substring(PREFIJO.length()));
                if (usuario != null) {
                    SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                            usuario[0], null, List.of(new SimpleGrantedAuthority("ROLE_" + usuario[1]))));
                }
            }
            chain.doFilter(request, response);
        }
    }
}
