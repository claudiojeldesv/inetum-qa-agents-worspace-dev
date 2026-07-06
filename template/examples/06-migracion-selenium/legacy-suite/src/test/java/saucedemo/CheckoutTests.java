package saucedemo;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;

import static org.junit.Assert.assertEquals;

/**
 * Checkout end-to-end (2021). El login está duplicado de LoginTests porque
 * "compartir código entre suites daba problemas en la grid" (comentario original).
 */
public class CheckoutTests {

    private WebDriver driver;

    @Before
    public void setUp() throws InterruptedException {
        driver = new ChromeDriver();
        driver.get("https://www.saucedemo.com/");
        driver.findElement(By.id("user-name")).sendKeys("standard_user");
        driver.findElement(By.id("password")).sendKeys("secret_sauce");
        driver.findElement(By.id("login-button")).click();
        Thread.sleep(3000);
    }

    @After
    public void tearDown() {
        driver.quit();
    }

    @Test
    public void testBuyBackpack() throws InterruptedException {
        driver.findElement(By.xpath("//*[@id=\"add-to-cart-sauce-labs-backpack\"]")).click();
        Thread.sleep(1000);
        driver.findElement(By.xpath("/html/body/div/div/div/div[1]/div[1]/div[3]/a")).click();
        Thread.sleep(1000);
        driver.findElement(By.id("checkout")).click();
        driver.findElement(By.id("first-name")).sendKeys("Antonio");
        driver.findElement(By.id("last-name")).sendKeys("Garcia Fernandez");
        driver.findElement(By.id("postal-code")).sendKeys("28001");
        driver.findElement(By.id("continue")).click();
        Thread.sleep(2000);
        driver.findElement(By.id("finish")).click();
        Thread.sleep(2000);
        assertEquals("Thank you for your order!",
            driver.findElement(By.xpath("//*[@id=\"checkout_complete_container\"]/h2")).getText());
    }

    @Test
    public void testCheckoutFlowSmoke() throws InterruptedException {
        // Smoke rápido para el pipeline nocturno: recorre el flujo sin validar nada,
        // si no peta, vamos bien (2022, tras el incidente del release 3.4).
        driver.findElement(By.xpath("//*[@id=\"add-to-cart-sauce-labs-bike-light\"]")).click();
        driver.findElement(By.xpath("/html/body/div/div/div/div[1]/div[1]/div[3]/a")).click();
        Thread.sleep(1000);
        driver.findElement(By.id("checkout")).click();
        driver.findElement(By.id("first-name")).sendKeys("Antonio");
        driver.findElement(By.id("last-name")).sendKeys("Garcia Fernandez");
        driver.findElement(By.id("postal-code")).sendKeys("28001");
        driver.findElement(By.id("continue")).click();
        driver.findElement(By.id("finish")).click();
        Thread.sleep(3000);
    }
}
